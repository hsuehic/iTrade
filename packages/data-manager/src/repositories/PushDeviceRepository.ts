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

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(PushDeviceEntity);
  }

  /**
   * Register (or update) a push device/token.
   *
   * Goals:
   * - Keep token unique per (platform, provider, pushToken)
   * - Keep device unique per (platform, provider, deviceId, appId, environment)
   * - Deactivate older tokens for the same device+app+env when token rotates
   */
  async register(input: RegisterPushDeviceInput): Promise<PushDeviceEntity> {
    const now = input.lastSeenAt ?? new Date();

    return await this.repository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(PushDeviceEntity);

      const existingByToken = await repo.findOne({
        where: {
          platform: input.platform,
          provider: input.provider,
          pushToken: input.pushToken,
        },
      });

      if (existingByToken) {
        existingByToken.userId = input.userId ?? null;
        existingByToken.deviceId = input.deviceId;
        existingByToken.appId = input.appId;
        existingByToken.appVersion = input.appVersion ?? null;
        existingByToken.environment = input.environment ?? null;
        existingByToken.isActive = input.isActive ?? true;
        existingByToken.lastSeenAt = now;

        // Deactivate other rows for this device key (token rotated, etc.)
        await repo
          .createQueryBuilder()
          .update(PushDeviceEntity)
          .set({ isActive: false })
          .where('id != :id', { id: existingByToken.id })
          .andWhere('platform = :platform', { platform: input.platform })
          .andWhere('provider = :provider', { provider: input.provider })
          .andWhere('deviceId = :deviceId', { deviceId: input.deviceId })
          .andWhere('appId = :appId', { appId: input.appId })
          .andWhere(
            input.environment == null
              ? 'environment IS NULL'
              : 'environment = :environment',
            input.environment == null ? {} : { environment: input.environment },
          )
          .callListeners(false)
          .execute();

        await repo
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
          .callListeners(false)
          .execute();

        return await repo.findOneByOrFail({ id: existingByToken.id });
      }

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
        await repo
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
          .callListeners(false)
          .execute();

        return await repo.findOneByOrFail({ id: existingByDevice.id });
      }

      const insertResult = await repo
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
        .callListeners(false)
        .execute();

      const insertedId = insertResult.identifiers[0]?.id as string | undefined;
      if (insertedId) {
        return await repo.findOneByOrFail({ id: insertedId });
      }

      return await repo.findOneOrFail({
        where: {
          platform: input.platform,
          provider: input.provider,
          pushToken: input.pushToken,
        },
      });
    });
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
