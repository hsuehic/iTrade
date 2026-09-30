import { DataSource, Repository } from 'typeorm';
import { normalizeSymbol, detectMarketType } from '@itrade/utils';

import { StrategyEntity, StrategyStatus, MarketType } from '../entities/Strategy';
import { StrategyPerformanceEntity } from '../entities/StrategyPerformance';

export type AdminStrategySortKey =
  | 'name'
  | 'createdAt'
  | 'updatedAt'
  | 'status'
  | 'symbol'
  | 'exchange'
  | 'totalPnL'
  | 'roi'
  | 'totalOrders';

/**
 * Escape LIKE/ILIKE metacharacters so a literal `%` or `_` typed into a search
 * box is matched literally instead of acting as a wildcard (searching for "_"
 * used to return every row). Pair with `ESCAPE '\'` on the SQL side.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** `<column> ILIKE <param>` with the escape clause applied consistently. */
function ilikeClause(column: string, param: string): string {
  return `${column} ILIKE :${param} ESCAPE '\\'`;
}

export interface AdminStrategyFilters {
  /** Free-text keyword: matches name / description / symbol / type (ILIKE). */
  search?: string;
  /** Token/symbol filter (ILIKE) — e.g. "BTC". */
  symbol?: string;
  /** Owner user id. */
  userId?: string;
  status?: string;
  exchange?: string;
  /** Strategy class name (exact). */
  type?: string;
  sortBy?: AdminStrategySortKey;
  sortDirection?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

const ADMIN_SORT_COLUMNS: Record<AdminStrategySortKey, string> = {
  name: 'strategy.name',
  createdAt: 'strategy.createdAt',
  updatedAt: 'strategy.updatedAt',
  status: 'strategy.status',
  symbol: 'strategy.symbol',
  exchange: 'strategy.exchange',
  totalPnL: 'performance.totalPnL',
  roi: 'performance.roi',
  totalOrders: 'performance.totalOrders',
};

/** Sort keys that live on the joined strategy_performance table. */
const PERFORMANCE_SORT_KEYS: AdminStrategySortKey[] = ['totalPnL', 'roi', 'totalOrders'];

export class StrategyRepository {
  private repository: Repository<StrategyEntity>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(StrategyEntity);
  }

  async create(data: {
    name: string;
    description?: string;
    type: string;
    status?: string;
    exchange?: string;
    symbol?: string;
    parameters?: Record<string, unknown>;
    initialDataConfig?: Record<string, unknown>;
    subscription?: Record<string, unknown>;
    userId: string;
  }): Promise<StrategyEntity> {
    // Automatically compute normalizedSymbol and marketType if symbol and exchange are provided
    let normalizedSymbol: string | undefined;
    let marketType: MarketType | undefined;
    if (data.symbol && data.exchange) {
      normalizedSymbol = normalizeSymbol(data.symbol, data.exchange);
      marketType = detectMarketType(data.symbol) as MarketType;
    }

    // Use insert() to bypass entity instantiation entirely
    // This avoids TypeORM's cyclic dependency detection in Next.js production builds

    const result = await this.repository.insert({
      name: data.name,
      description: data.description,
      type: data.type,
      status: (data.status as StrategyStatus) || StrategyStatus.STOPPED,
      exchange: data.exchange,
      symbol: data.symbol,
      normalizedSymbol,
      marketType,
      parameters: data.parameters,
      initialDataConfig: data.initialDataConfig,
      subscription: data.subscription,
      userId: data.userId,
    } as Parameters<Repository<StrategyEntity>['insert']>[0]);

    // Get the inserted ID and fetch the complete entity
    const insertedId = result.identifiers[0]?.id;
    if (!insertedId) {
      throw new Error('Failed to create strategy: no ID returned');
    }

    // Use findOne which doesn't trigger cyclic dependency
    const created = await this.repository.findOne({ where: { id: insertedId } });
    if (!created) {
      throw new Error('Failed to fetch created strategy');
    }

    return created;
  }

  async findById(
    id: number,
    options?: { includeUser?: boolean; includePerformance?: boolean },
  ): Promise<StrategyEntity | null> {
    const query = this.repository
      .createQueryBuilder('strategy')
      .where('strategy.id = :id', { id });

    if (options?.includeUser) {
      // PERF: select ONLY the columns callers actually need (ownership checks
      // read strategy.user.id). leftJoinAndSelect would pull every user column
      // — including `user.image`, which stores the avatar as a base64 data URL
      // and can be multiple MB. That turned GET /api/strategies/:id into a
      // 3.3 MB response (nginx then spilled it to disk: "an upstream response
      // is buffered to a temporary file") on every poll of the strategy page.
      query.leftJoin('strategy.user', 'user').addSelect(['user.id', 'user.name']);
    }

    if (options?.includePerformance) {
      // Use leftJoinAndMapOne because StrategyEntity doesn't have the decorator
      // to avoid circular module dependencies (ReferenceError in Next.js production)
      query.leftJoinAndMapOne(
        'strategy.performance',
        StrategyPerformanceEntity,
        'performance',
        'performance.strategyId = strategy.id',
      );
    }

    return await query.getOne();
  }

  async findAll(filters?: {
    userId?: string;
    status?: string;
    exchange?: string;
    includeUser?: boolean; // Control whether to load user relation
    includePerformance?: boolean; // Control whether to load performance relation
  }): Promise<StrategyEntity[]> {
    const query = this.repository.createQueryBuilder('strategy');

    // Only join user if explicitly requested — and never select user.image
    // (base64 avatar, can be several MB). See findById for details.
    if (filters?.includeUser) {
      query.leftJoin('strategy.user', 'user').addSelect(['user.id', 'user.name']);
    }

    // Only join performance if explicitly requested
    if (filters?.includePerformance) {
      // Use leftJoinAndMapOne because StrategyEntity doesn't have the decorator
      // to avoid circular module dependencies (ReferenceError in Next.js production)
      query.leftJoinAndMapOne(
        'strategy.performance',
        StrategyPerformanceEntity,
        'performance',
        'performance.strategyId = strategy.id',
      );
    }

    if (filters?.userId) {
      query.andWhere('strategy.userId = :userId', { userId: filters.userId });
    }
    if (filters?.status) {
      query.andWhere('strategy.status = :status', { status: filters.status });
    }
    if (filters?.exchange) {
      query.andWhere('strategy.exchange = :exchange', {
        exchange: filters.exchange,
      });
    }

    return await query.orderBy('strategy.createdAt', 'DESC').getMany();
  }

  /**
   * Admin-scope listing: strategies across ALL users, with keyword/token/owner
   * filters, server-side sorting (incl. performance metrics) and pagination.
   *
   * Joins `user` (id/name/email only — never `user.image`, a base64 avatar that
   * can be several MB; see findById) and maps `strategy_performance` so ROI/PnL
   * can be displayed and sorted on. Performance columns are ordered NULLS LAST
   * so strategies that have no performance row never occupy the top of a DESC
   * sort.
   */
  async findAllAdmin(
    filters?: AdminStrategyFilters,
  ): Promise<{ strategies: StrategyEntity[]; total: number }> {
    const page = filters?.page && filters.page > 0 ? filters.page : 1;
    const pageSize = Math.min(
      filters?.pageSize && filters.pageSize > 0 ? filters.pageSize : 50,
      200,
    );

    const query = this.repository
      .createQueryBuilder('strategy')
      .leftJoin('strategy.user', 'user')
      .addSelect(['user.id', 'user.name', 'user.email'])
      .leftJoinAndMapOne(
        'strategy.performance',
        StrategyPerformanceEntity,
        'performance',
        'performance.strategyId = strategy.id',
      );

    if (filters?.search) {
      query.andWhere(
        `(${ilikeClause('strategy.name', 'search')} OR ${ilikeClause('strategy.description', 'search')} OR ${ilikeClause('strategy.symbol', 'search')} OR ${ilikeClause('strategy.type', 'search')})`,
        { search: `%${escapeLikePattern(filters.search)}%` },
      );
    }
    if (filters?.symbol) {
      query.andWhere(ilikeClause('strategy.symbol', 'symbol'), {
        symbol: `%${escapeLikePattern(filters.symbol)}%`,
      });
    }
    if (filters?.userId) {
      query.andWhere('strategy.userId = :userId', { userId: filters.userId });
    }
    if (filters?.status) {
      query.andWhere('strategy.status = :status', { status: filters.status });
    }
    if (filters?.exchange) {
      query.andWhere('strategy.exchange = :exchange', {
        exchange: filters.exchange,
      });
    }
    if (filters?.type) {
      query.andWhere('strategy.type = :type', { type: filters.type });
    }

    const sortKey: AdminStrategySortKey = filters?.sortBy ?? 'createdAt';
    const order = filters?.sortDirection === 'asc' ? 'ASC' : 'DESC';
    const orderColumn = ADMIN_SORT_COLUMNS[sortKey] ?? 'strategy.createdAt';
    // Nullable columns (performance metrics, plus symbol/exchange) are pinned to
    // the end of a DESC sort — Postgres puts NULLs FIRST on DESC by default,
    // which would fill the top of the list with rows that have no value.
    const nulls =
      PERFORMANCE_SORT_KEYS.includes(sortKey) ||
      sortKey === 'symbol' ||
      sortKey === 'exchange'
        ? 'NULLS LAST'
        : undefined;

    query
      .orderBy(orderColumn, order, nulls)
      .addOrderBy('strategy.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [strategies, total] = await query.getManyAndCount();
    return { strategies, total };
  }

  async update(id: number, updates: Partial<StrategyEntity>): Promise<void> {
    const updateData: Partial<StrategyEntity> = { ...updates };

    // Re-compute normalizedSymbol and marketType if symbol or exchange is being updated
    if (updateData.symbol || updateData.exchange) {
      // Fetch existing strategy to get current values
      const existing = await this.repository.findOne({ where: { id } });
      if (existing) {
        const symbol = updateData.symbol || existing.symbol;
        const exchange = updateData.exchange || existing.exchange;
        if (symbol && exchange) {
          updateData.normalizedSymbol = normalizeSymbol(symbol, exchange);
          updateData.marketType = detectMarketType(symbol) as MarketType;
        }
      }
    }

    await this.repository.update(
      { id },
      updateData as Parameters<Repository<StrategyEntity>['update']>[1],
    );
  }

  async delete(id: number): Promise<void> {
    await this.repository.delete({ id });
  }

  async updateStatus(
    id: number,
    status: StrategyStatus,
    errorMessage?: string,
  ): Promise<void> {
    const updates: Partial<StrategyEntity> = {
      status,
      lastExecutionTime: new Date(),
    };
    if (errorMessage !== undefined) {
      updates.errorMessage = errorMessage;
    }
    await this.repository.update(
      { id },
      updates as Parameters<Repository<StrategyEntity>['update']>[1],
    );
  }
}
