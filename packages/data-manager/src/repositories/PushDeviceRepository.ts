import { DataSource, IsNull, Repository } from 'typeorm';

import {
  PushDeviceEntity,
  PushEnvironment,
  PushPlatform,
  PushProvider,
} from '../entities/PushDevice';

export interface RegisterPushDeviceInput {
  userId?: string | null;
  deviceId: string;
  platform: PushPlatform;
  provider: PushProvider;
  pushToken: string;
  appId: string;
  appVersion?: string | null;
  environment?: PushEnvironment | null;
  isActive?: boolean;
  lastSeenAt?: Date;
}

export class PushDeviceRepository {
  private repository: Repository<PushDeviceEntity>;
  private dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.repository = dataSource.getRepository(PushDeviceEntity);
  }

  /**
   * Register (or update) a push device/token.
   *
   * Goals:
   * - Keep token unique per (platform, provider, pushToken)
   * - Keep device unique per (platform, provider, deviceId, appId, environment)
   * - Deactivate older tokens for the same device+app+env when token rotates
   * - Ensure at most ONE active token per user+platform+provider+appId+environment
   *   (handles reinstalls where deviceId changes)
   */
  async register(input: RegisterPushDeviceInput): Promise<PushDeviceEntity> {
    const now = input.lastSeenAt ?? new Date();

    // Use queryRunner for transactions to ensure compatibility with Next.js production builds
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const repo = queryRunner.manager.getRepository(PushDeviceEntity);
      let result: PushDeviceEntity;

      // ── Step 1: Upsert by token or device key ────────────────────────

      const existingByToken = await repo.findOne({
        where: {
          platform: input.platform,
          provider: input.provider,
          pushToken: input.pushToken,
        },
      });

      if (existingByToken) {
        // Delete other rows for this device key (token rotated, etc.)
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(PushDeviceEntity)
          .where('id != :id', { id: existingByToken.id })
          .andWhere('platform = :platform', { platform: input.platform })
          .andWhere('provider = :provider', { provider: input.provider })
          .andWhere('"deviceId" = :deviceId', { deviceId: input.deviceId })
          .andWhere('"appId" = :appId', { appId: input.appId })
          .andWhere(
            input.environment == null
              ? 'environment IS NULL'
              : 'environment = :environment',
            input.environment == null ? {} : { environment: input.environment },
          )
          .execute();

        await queryRunner.manager
          .createQueryBuilder()
          .update(PushDeviceEntity)
          .set({
            userId: input.userId ?? null,
            deviceId: input.deviceId,
            appId: input.appId,
            appVersion: input.appVersion ?? null,
            environment: input.environment ?? null,
            isActive: input.isActive ?? true,
            lastSeenAt: now,
          })
          .where('id = :id', { id: existingByToken.id })
          .execute();

        result = await repo.findOneByOrFail({ id: existingByToken.id });
      } else {
        const existingByDevice = await repo.findOne({
          where: {
            platform: input.platform,
            provider: input.provider,
            deviceId: input.deviceId,
            appId: input.appId,
            environment: input.environment == null ? IsNull() : input.environment,
          },
        });

        if (existingByDevice) {
          await queryRunner.manager
            .createQueryBuilder()
            .update(PushDeviceEntity)
            .set({
              userId: input.userId ?? null,
              pushToken: input.pushToken,
              appVersion: input.appVersion ?? null,
              isActive: input.isActive ?? true,
              lastSeenAt: now,
            })
            .where('id = :id', { id: existingByDevice.id })
            .execute();

          result = await repo.findOneByOrFail({ id: existingByDevice.id });
        } else {
          const insertResult = await queryRunner.manager
            .createQueryBuilder()
            .insert()
            .into(PushDeviceEntity)
            .values({
              userId: input.userId ?? null,
              deviceId: input.deviceId,
              platform: input.platform,
              provider: input.provider,
              pushToken: input.pushToken,
              appId: input.appId,
              appVersion: input.appVersion ?? null,
              environment: input.environment ?? null,
              isActive: input.isActive ?? true,
              lastSeenAt: now,
            })
            .execute();

          const insertedId = insertResult.identifiers[0]?.id as string | undefined;
          if (insertedId) {
            result = await repo.findOneByOrFail({ id: insertedId });
          } else {
            result = await repo.findOneOrFail({
              where: {
                platform: input.platform,
                provider: input.provider,
                pushToken: input.pushToken,
              },
            });
          }
        }
      }

      // ── Step 2: Delete stale tokens for the same user ─────────────────
      // After reinstalls the deviceId changes, so old rows with the previous
      // deviceId remain.  We keep only the current row per
      // userId + platform + provider + appId + environment.
      if (input.userId) {
        await queryRunner.manager
          .createQueryBuilder()
          .delete()
          .from(PushDeviceEntity)
          .where('id != :currentId', { currentId: result.id })
          .andWhere('"userId" = :userId', { userId: input.userId })
          .andWhere('platform = :platform', { platform: input.platform })
          .andWhere('provider = :provider', { provider: input.provider })
          .andWhere('"appId" = :appId', { appId: input.appId })
          .andWhere(
            input.environment == null
              ? 'environment IS NULL'
              : 'environment = :environment',
            input.environment == null ? {} : { environment: input.environment },
          )
          .execute();
      }

      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getActiveTokensForUser(
    userId: string,
    filters?: { platform?: PushPlatform; provider?: PushProvider },
  ): Promise<string[]> {
    const qb = this.repository
      .createQueryBuilder('d')
      .select('d.pushToken', 'pushToken')
      .where('d.userId = :userId', { userId })
      .andWhere('d.isActive = true');

    if (filters?.platform) {
      qb.andWhere('d.platform = :platform', { platform: filters.platform });
    }
    if (filters?.provider) {
      qb.andWhere('d.provider = :provider', { provider: filters.provider });
    }

    const rows = await qb.getRawMany<{ pushToken: string }>();
    return rows.map((r) => r.pushToken);
  }
}
