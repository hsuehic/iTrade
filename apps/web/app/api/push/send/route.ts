import { NextRequest, NextResponse } from 'next/server';
import type { BatchResponse } from '@itrade/push-notification';
import {
  PushDeviceEntity,
  PushNotificationLogEntity,
  PushPlatform,
  PushProvider,
} from '@itrade/data-manager';

import { auth } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';
import {
  sendToDevice,
  sendToMultipleDevices,
  sendToTopic,
} from '@itrade/push-notification';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SendTarget =
  | { type: 'user'; userId: string }
  | { type: 'tokens'; tokens: string[] }
  | { type: 'topic'; topic: string }
  | { type: 'all'; platform?: PushPlatform; provider?: PushProvider; limit?: number }
  | {
      type: 'filter';
      filters: {
        userId?: string;
        deviceId?: string;
        appId?: string;
        appVersion?: string;
        environment?: string | null;
        isActive?: boolean;
        platform?: PushPlatform;
        provider?: PushProvider;
        limit?: number;
      };
    };

type SendBody = {
  platform?: string;
  provider?: string;
  category?: string;
  notification?: { title?: string; body?: string; imageUrl?: string };
  data?: Record<string, unknown>; // Allow nested objects for APNS config
  target?: SendTarget;
};

function isPlatform(value: string): value is PushPlatform {
  return value === 'ios' || value === 'android' || value === 'web';
}

function isProvider(value: string): value is PushProvider {
  return value === 'fcm' || value === 'apns' || value === 'webpush';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function summarizeBatch(batch: BatchResponse) {
  const errors = batch.responses
    .map((r: BatchResponse['responses'][number], idx: number) =>
      r.success ? null : { idx, error: r.error?.message ?? 'Unknown error' },
    )
    .filter(Boolean)
    .slice(0, 20);

  return {
    successCount: batch.successCount,
    failureCount: batch.failureCount,
    sampleErrors: errors,
  };
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Optional: Restrict to admin users only if ENABLE_PUSH_ADMIN_ONLY is set to 'true'
  // By default, all authenticated users can send push notifications
  const enableAdminOnly = process.env.ENABLE_PUSH_ADMIN_ONLY === 'true';
  if (enableAdminOnly) {
    const role = (session.user as unknown as { role?: string | null }).role ?? null;
    if (role !== 'admin') {
      console.log('[Push Send] Forbidden: Admin role required', {
        userId: session.user.id,
        role,
        enableAdminOnly,
      });
      return NextResponse.json(
        { error: 'Forbidden: Admin role required' },
        { status: 403 },
      );
    }
  }

  try {
    const body = (await request.json()) as SendBody;

    const platformRaw = body.platform?.trim() ?? 'web';
    const providerRaw = body.provider?.trim() ?? 'fcm';
    const categoryRaw = body.category?.trim() ?? 'general';
    if (!isPlatform(platformRaw)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }
    if (!isProvider(providerRaw)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }
    if (categoryRaw.length > 32) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    let notification = body.notification ?? {};
    if (!notification.title && !notification.body) {
      const aps =
        body.data && isRecord(body.data) && isRecord(body.data.aps)
          ? (body.data.aps as Record<string, unknown>)
          : undefined;
      const apsAlert =
        aps && 'alert' in aps && isRecord((aps as Record<string, unknown>).alert)
          ? ((aps as Record<string, unknown>).alert as Record<string, unknown>)
          : undefined;

      const dataTitle =
        typeof body.data?.title === 'string' && body.data.title.trim()
          ? body.data.title
          : undefined;
      const dataBody =
        typeof body.data?.body === 'string' && body.data.body.trim()
          ? body.data.body
          : undefined;

      if (apsAlert && ('title' in apsAlert || 'body' in apsAlert)) {
        notification = {
          title: typeof apsAlert.title === 'string' ? apsAlert.title : undefined,
          body: typeof apsAlert.body === 'string' ? apsAlert.body : undefined,
        };
      } else if (dataTitle || dataBody) {
        // Fallback to flat data.title/body for data-only pushes
        notification = {
          title: dataTitle,
          body: dataBody,
        };
      } else {
        // Allow data-only push (e.g., badge only) without notification text
        notification = {};
      }
    }

    const target = body.target;
    if (!target) {
      return NextResponse.json({ error: 'Missing target' }, { status: 400 });
    }

    // Parse APNS config from data if present
    // Extract 'aps' from data and convert remaining data to string key-value pairs
    let apnsConfig: { aps?: Record<string, unknown> } | undefined;
    let dataForFirebase: Record<string, string> | undefined;

    if (body.data) {
      const { aps, ...restData } = body.data;

      // If 'aps' exists, extract it for APNS config
      if (aps && typeof aps === 'object' && !Array.isArray(aps)) {
        apnsConfig = { aps: aps as Record<string, unknown> };

        // Log APNS config for debugging
        if (process.env.NODE_ENV === 'development') {
          console.log(
            '[Push Send] APNS config extracted:',
            JSON.stringify(apnsConfig, null, 2),
          );
        }
      }

      // Convert remaining data to string key-value pairs (Firebase requirement)
      dataForFirebase = Object.fromEntries(
        Object.entries(restData).map(([key, value]) => [
          key,
          typeof value === 'string' ? value : JSON.stringify(value),
        ]),
      );
    }

    const dataManager = await getDataManager();
    const deviceRepo = dataManager.dataSource.getRepository(PushDeviceEntity);
    const logRepo = dataManager.dataSource.getRepository(PushNotificationLogEntity);

    let tokens: string[] = [];
    let sendResult: unknown = null;
    let successCount = 0;
    let failureCount = 0;

    if (target.type === 'topic') {
      await sendToTopic(target.topic, notification, dataForFirebase, apnsConfig);
      successCount = 1;
      sendResult = { type: 'topic', topic: target.topic };
    } else if (target.type === 'user') {
      // Support both user ID and email
      let userId = target.userId.trim();

      // If it looks like an email, find the user by email
      if (userId.includes('@')) {
        const { User } = await import('@itrade/data-manager');
        const userRepo = dataManager.dataSource.getRepository(User);
        const user = await userRepo.findOne({
          where: { email: userId },
          select: ['id'],
        });

        if (!user) {
          return NextResponse.json(
            { error: `User not found with email: ${userId}` },
            { status: 404 },
          );
        }

        userId = user.id;
      }

      const rows = await deviceRepo
        .createQueryBuilder('d')
        .select('d.pushToken', 'pushToken')
        .where('d.userId = :userId', { userId })
        .andWhere('d.isActive = true')
        .andWhere('d.platform = :platform', { platform: platformRaw })
        .andWhere('d.provider = :provider', { provider: providerRaw })
        .getRawMany<{ pushToken: string }>();

      tokens = rows.map((r) => r.pushToken).slice(0, 500);
      if (tokens.length === 0) {
        return NextResponse.json(
          { error: 'No active devices for user' },
          { status: 404 },
        );
      }

      if (tokens.length === 1) {
        await sendToDevice(tokens[0], notification, dataForFirebase, apnsConfig);
        successCount = 1;
        sendResult = { type: 'user', tokenCount: 1 };
      } else {
        const batch = await sendToMultipleDevices(
          tokens,
          notification,
          dataForFirebase,
          apnsConfig,
        );
        const summary = summarizeBatch(batch);
        successCount = summary.successCount;
        failureCount = summary.failureCount;
        sendResult = summary;
      }
    } else if (target.type === 'tokens') {
      tokens = (target.tokens ?? []).filter(Boolean).slice(0, 500);
      if (tokens.length === 0) {
        return NextResponse.json({ error: 'No tokens provided' }, { status: 400 });
      }

      if (tokens.length === 1) {
        await sendToDevice(tokens[0], notification, dataForFirebase, apnsConfig);
        successCount = 1;
        sendResult = { type: 'tokens', tokenCount: 1 };
      } else {
        const batch = await sendToMultipleDevices(
          tokens,
          notification,
          dataForFirebase,
          apnsConfig,
        );
        const summary = summarizeBatch(batch);
        successCount = summary.successCount;
        failureCount = summary.failureCount;
        sendResult = summary;
      }
    } else if (target.type === 'all') {
      const limit = Math.min(Math.max(target.limit ?? 200, 1), 500);
      const qb = deviceRepo
        .createQueryBuilder('d')
        .select('d.pushToken', 'pushToken')
        .where('d.isActive = true');

      const platform = target.platform ?? platformRaw;
      const provider = target.provider ?? providerRaw;
      qb.andWhere('d.platform = :platform', { platform });
      qb.andWhere('d.provider = :provider', { provider });
      qb.orderBy('d.lastSeenAt', 'DESC').take(limit);

      const rows = await qb.getRawMany<{ pushToken: string }>();
      tokens = rows.map((r) => r.pushToken);

      if (tokens.length === 0) {
        return NextResponse.json({ error: 'No active devices found' }, { status: 404 });
      }

      if (tokens.length === 1) {
        await sendToDevice(tokens[0], notification, dataForFirebase, apnsConfig);
        successCount = 1;
        sendResult = { type: 'all', tokenCount: 1 };
      } else {
        const batch = await sendToMultipleDevices(
          tokens,
          notification,
          dataForFirebase,
          apnsConfig,
        );
        const summary = summarizeBatch(batch);
        successCount = summary.successCount;
        failureCount = summary.failureCount;
        sendResult = summary;
      }
    } else if (target.type === 'filter') {
      const f = target.filters ?? {};
      const limit = Math.min(Math.max(f.limit ?? 200, 1), 500);

      const qb = deviceRepo.createQueryBuilder('d').select('d.pushToken', 'pushToken');

      const isActive = f.isActive ?? true;
      qb.where('d.isActive = :isActive', { isActive });

      const platform = f.platform ?? platformRaw;
      const provider = f.provider ?? providerRaw;
      qb.andWhere('d.platform = :platform', { platform });
      qb.andWhere('d.provider = :provider', { provider });

      if (f.userId) qb.andWhere('d.userId = :userId', { userId: f.userId });
      if (f.deviceId) qb.andWhere('d.deviceId = :deviceId', { deviceId: f.deviceId });
      if (f.appId) qb.andWhere('d.appId = :appId', { appId: f.appId });
      if (f.appVersion)
        qb.andWhere('d.appVersion = :appVersion', { appVersion: f.appVersion });
      if (f.environment === null) {
        qb.andWhere('d.environment IS NULL');
      } else if (typeof f.environment === 'string' && f.environment.trim()) {
        qb.andWhere('d.environment = :environment', {
          environment: f.environment.trim(),
        });
      }

      qb.orderBy('d.lastSeenAt', 'DESC').take(limit);

      const rows = await qb.getRawMany<{ pushToken: string }>();
      tokens = rows.map((r) => r.pushToken);

      if (tokens.length === 0) {
        return NextResponse.json({ error: 'No active devices found' }, { status: 404 });
      }

      if (tokens.length === 1) {
        await sendToDevice(tokens[0], notification, dataForFirebase, apnsConfig);
        successCount = 1;
        sendResult = { type: 'filter', tokenCount: 1 };
      } else {
        const batch = await sendToMultipleDevices(
          tokens,
          notification,
          dataForFirebase,
          apnsConfig,
        );
        const summary = summarizeBatch(batch);
        successCount = summary.successCount;
        failureCount = summary.failureCount;
        sendResult = summary;
      }
    }

    // Save send log (best-effort; don't fail request if logging fails)
    try {
      await logRepo.save(
        logRepo.create({
          senderUserId: session.user.id,
          platform: platformRaw,
          provider: providerRaw,
          category: categoryRaw as PushNotificationLogEntity['category'],
          targetType: target.type,
          target:
            target.type === 'tokens'
              ? { type: 'tokens', tokenCount: tokens.length }
              : target.type === 'user'
                ? { type: 'user', userId: target.userId, tokenCount: tokens.length }
                : target.type === 'topic'
                  ? { type: 'topic', topic: target.topic }
                  : target.type === 'filter'
                    ? {
                        type: 'filter',
                        tokenCount: tokens.length,
                        filters: target.filters,
                      }
                    : { type: 'all', tokenCount: tokens.length },
          notification: notification as unknown as Record<string, unknown>,
          data: (body.data ?? null) as unknown as Record<string, unknown> | null,
          successCount,
          failureCount,
          result: (sendResult ?? null) as Record<string, unknown> | null,
        }),
      );
    } catch (e) {
      console.warn('Failed to persist push log:', e);
    }

    return NextResponse.json({
      success: true,
      platform: platformRaw,
      provider: providerRaw,
      targetType: target.type,
      tokenCount: tokens.length,
      successCount,
      failureCount,
      result: sendResult,
    });
  } catch (error) {
    console.error('Error sending push message:', error);
    return NextResponse.json(
      { error: 'Failed to send push message', message: (error as Error).message },
      { status: 500 },
    );
  }
}
