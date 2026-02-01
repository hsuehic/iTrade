import type { Decimal } from 'decimal.js';
import type { ILogger, Order } from '@itrade/core';
import {
  PushDeviceEntity,
  PushNotificationLogEntity,
  PushPlatform,
  PushProvider,
  StrategyEntity,
  TypeOrmDataManager,
} from '@itrade/data-manager';
import {
  isPushEnabled,
  sendToDevice,
  sendToMultipleDevices,
} from '@itrade/push-notification';

type OrderNotificationKind = 'created' | 'filled' | 'partial';

type PushNotificationOptions = {
  defaultUserId?: string;
  platform?: PushPlatform;
  provider?: PushProvider;
  category?: PushNotificationLogEntity['category'];
};

type DeviceTokenRow = {
  pushToken: string;
  platform: PushPlatform;
  provider: PushProvider;
};

export class PushNotificationService {
  private readonly platform?: PushPlatform;
  private readonly provider: PushProvider;
  private readonly category: PushNotificationLogEntity['category'];
  private readonly defaultUserId?: string;
  private readonly strategyUserCache = new Map<number, string>();

  constructor(
    private readonly dataManager: TypeOrmDataManager,
    private readonly logger: ILogger,
    options?: PushNotificationOptions,
  ) {
    this.platform = options?.platform ?? parsePlatformEnv(process.env.PUSH_PLATFORM);
    this.provider =
      options?.provider ??
      parseProviderEnv(process.env.PUSH_PROVIDER) ??
      PushProvider.FCM;
    this.category =
      options?.category ?? parseCategoryEnv(process.env.PUSH_CATEGORY) ?? 'trading';
    this.defaultUserId = options?.defaultUserId;
  }

  async notifyOrderUpdate(order: Order, kind: OrderNotificationKind): Promise<void> {
    if (!isPushEnabled()) {
      this.logger.info('📨 Push notifications disabled (Firebase not initialized).');
      return;
    }

    const userId = await this.resolveUserId(order);
    if (!userId) {
      this.logger.info(`📨 Push skipped: no user for order ${order.id}`);
      return;
    }

    const devices = await this.getActiveTokens(userId);
    if (devices.length === 0) {
      this.logger.info(`📨 Push skipped: no active devices for user ${userId}`);
      return;
    }

    const notification = buildOrderNotification(order, kind);
    const data = buildOrderData(order, kind);

    const tokensByPlatform = groupByPlatform(devices);
    for (const [platform, tokens] of tokensByPlatform) {
      await this.sendAndLog(userId, platform, tokens, notification, data, order, kind);
    }
  }

  private async resolveUserId(order: Order): Promise<string | null> {
    if (order.userId) {
      return order.userId;
    }

    if (order.strategyId) {
      const cached = this.strategyUserCache.get(order.strategyId);
      if (cached) return cached;

      try {
        const repo = this.dataManager.dataSource.getRepository(StrategyEntity);
        const row = await repo
          .createQueryBuilder('s')
          .select('s.userId', 'userId')
          .where('s.id = :id', { id: order.strategyId })
          .getRawOne<{ userId?: string }>();

        if (row?.userId) {
          this.strategyUserCache.set(order.strategyId, row.userId);
          return row.userId;
        }
      } catch (error) {
        this.logger.error('❌ Failed to resolve strategy user', error as Error);
      }
    }

    return this.defaultUserId ?? null;
  }

  private async getActiveTokens(userId: string): Promise<DeviceTokenRow[]> {
    const repo = this.dataManager.dataSource.getRepository(PushDeviceEntity);
    const qb = repo
      .createQueryBuilder('d')
      .select('d.pushToken', 'pushToken')
      .addSelect('d.platform', 'platform')
      .addSelect('d.provider', 'provider')
      .where('d.userId = :userId', { userId })
      .andWhere('d.isActive = true')
      .andWhere('d.provider = :provider', { provider: this.provider });

    if (this.platform) {
      qb.andWhere('d.platform = :platform', { platform: this.platform });
    }

    const rows = await qb.getRawMany<DeviceTokenRow>();
    return rows.map((row) => ({
      pushToken: row.pushToken,
      platform: row.platform,
      provider: row.provider,
    }));
  }

  private async sendAndLog(
    userId: string,
    platform: PushPlatform,
    tokens: string[],
    notification: { title?: string; body?: string },
    data: Record<string, string>,
    order: Order,
    kind: OrderNotificationKind,
  ): Promise<void> {
    let successCount = 0;
    let failureCount = 0;
    let result: Record<string, unknown> | null = null;

    try {
      if (tokens.length === 1) {
        await sendToDevice(tokens[0], notification, data);
        successCount = 1;
        result = { type: 'user', tokenCount: 1 };
      } else {
        const batch = await sendToMultipleDevices(tokens, notification, data);
        successCount = batch.successCount;
        failureCount = batch.failureCount;
        result = summarizeBatch(batch);
      }
    } catch (error) {
      this.logger.error('❌ Failed to send order push', error as Error);
      failureCount = tokens.length;
      result = { error: (error as Error).message };
    }

    try {
      const repo = this.dataManager.dataSource.getRepository(PushNotificationLogEntity);
      await repo.save(
        repo.create({
          senderUserId: userId,
          platform,
          provider: this.provider,
          category: this.category,
          targetType: 'user',
          target: { type: 'user', userId, tokenCount: tokens.length },
          notification,
          data,
          successCount,
          failureCount,
          result,
        }),
      );
    } catch (error) {
      this.logger.warn('Failed to persist push log:', {
        error: (error as Error).message,
      });
    }

    if (successCount > 0) {
      this.logger.info(
        `📨 Push sent (${kind}): ${order.symbol} ${order.side} ` +
          `${order.executedQuantity?.toString() ?? '0'}/${order.quantity.toString()} ` +
          `to ${tokens.length} device(s)`,
      );
    }
  }
}

function parsePlatformEnv(value?: string): PushPlatform | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  if (v === 'ios') return PushPlatform.IOS;
  if (v === 'android') return PushPlatform.ANDROID;
  if (v === 'web') return PushPlatform.WEB;
  return undefined;
}

function parseProviderEnv(value?: string): PushProvider | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  if (v === 'fcm') return PushProvider.FCM;
  if (v === 'apns') return PushProvider.APNS;
  if (v === 'webpush') return PushProvider.WEBPUSH;
  return undefined;
}

function parseCategoryEnv(
  value?: string,
): PushNotificationLogEntity['category'] | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  if (v === 'general' || v === 'marketing' || v === 'trading' || v === 'security') {
    return v;
  }
  if (v === 'system') return 'system';
  return undefined;
}

function buildOrderNotification(order: Order, kind: OrderNotificationKind) {
  let status = 'Update';
  if (kind === 'created') status = 'Placed';
  else if (kind === 'filled') status = 'Filled';
  else if (kind === 'partial') status = 'Partially Filled';
  const executed = formatDecimal(order.executedQuantity) ?? '0';
  const quantity = formatDecimal(order.quantity) ?? '0';
  const price = formatDecimal(order.price);
  const averagePrice = formatDecimal(order.averagePrice);
  const commission = formatDecimal(order.commission);
  const strategyName = order.strategyName?.trim();

  const bodyParts = [
    `${order.symbol} ${order.side}`,
    `${executed}/${quantity}`,
    price ? `@ ${price}` : averagePrice ? `Avg ${averagePrice}` : undefined,
    commission
      ? `Fee ${commission}${order.commissionAsset ? ` ${order.commissionAsset}` : ''}`
      : undefined,
  ].filter(Boolean);

  return {
    title: strategyName ? `Order ${status} • ${strategyName}` : `Order ${status}`,
    body: bodyParts.join(' '),
  };
}

function buildOrderData(
  order: Order,
  kind: OrderNotificationKind,
): Record<string, string> {
  const data: Record<string, string> = {
    event:
      kind === 'created'
        ? 'order_created'
        : kind === 'filled'
        ? 'order_filled'
        : 'order_partially_filled',
    orderId: order.id,
    symbol: order.symbol,
    side: order.side,
    status: order.status,
    type: order.type,
    timeInForce: order.timeInForce,
    quantity: order.quantity.toString(),
    category: 'trading',
  };

  if (order.clientOrderId) data.clientOrderId = order.clientOrderId;

  const executed = formatDecimal(order.executedQuantity);
  if (executed) data.executedQuantity = executed;

  const price = formatDecimal(order.price);
  if (price) data.price = price;

  const stopPrice = formatDecimal(order.stopPrice);
  if (stopPrice) data.stopPrice = stopPrice;

  const averagePrice = formatDecimal(order.averagePrice);
  if (averagePrice) data.averagePrice = averagePrice;

  const realizedPnl = formatDecimal(order.realizedPnl);
  if (realizedPnl) data.realizedPnl = realizedPnl;

  const unrealizedPnl = formatDecimal(order.unrealizedPnl);
  if (unrealizedPnl) data.unrealizedPnl = unrealizedPnl;

  const cumulativeQuote = formatDecimal(order.cummulativeQuoteQuantity);
  if (cumulativeQuote) data.cummulativeQuoteQuantity = cumulativeQuote;

  const commission = formatDecimal(order.commission);
  if (commission) data.commission = commission;
  if (order.commissionAsset) data.commissionAsset = order.commissionAsset;

  if (order.exchange) data.exchange = order.exchange;
  if (order.strategyId) data.strategyId = String(order.strategyId);
  if (order.strategyName) data.strategyName = order.strategyName;
  if (order.updateTime) data.updateTime = order.updateTime.toISOString();

  return data;
}

function formatDecimal(value?: Decimal): string | undefined {
  if (!value) return undefined;
  return value.toString();
}

function summarizeBatch(batch: {
  successCount: number;
  failureCount: number;
  responses: unknown[];
}) {
  return {
    successCount: batch.successCount,
    failureCount: batch.failureCount,
  };
}

function groupByPlatform(devices: DeviceTokenRow[]): Map<PushPlatform, string[]> {
  const grouped = new Map<PushPlatform, string[]>();
  for (const device of devices) {
    const list = grouped.get(device.platform) ?? [];
    list.push(device.pushToken);
    grouped.set(device.platform, list);
  }
  return grouped;
}
