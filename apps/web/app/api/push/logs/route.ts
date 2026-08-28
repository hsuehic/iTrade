import { NextRequest, NextResponse } from 'next/server';
import {
  PushNotificationLogEntity,
  PushPlatform,
  PushProvider,
} from '@itrade/data-manager';

import { auth } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseIntParam(value: string | null, fallback: number) {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function isPlatform(value: string): value is PushPlatform {
  return value === 'ios' || value === 'android' || value === 'web';
}

function isProvider(value: string): value is PushProvider {
  return value === 'fcm' || value === 'apns' || value === 'webpush';
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const platformRaw = url.searchParams.get('platform');
  const providerRaw = url.searchParams.get('provider');
  const limit = Math.min(parseIntParam(url.searchParams.get('limit'), 50), 200);
  const offset = Math.max(parseIntParam(url.searchParams.get('offset'), 0), 0);

  const platform = platformRaw && isPlatform(platformRaw) ? platformRaw : undefined;
  const provider = providerRaw && isProvider(providerRaw) ? providerRaw : undefined;

  try {
    const dataManager = await getDataManager();
    const repo = dataManager.dataSource.getRepository(PushNotificationLogEntity);

    const qb = repo
      .createQueryBuilder('l')
      .orderBy('l.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (platform) qb.andWhere('l.platform = :platform', { platform });
    if (provider) qb.andWhere('l.provider = :provider', { provider });

    const [logs, total] = await qb.getManyAndCount();

    return NextResponse.json({
      logs: logs.map((l) => ({
        id: l.id,
        createdAt: l.createdAt,
        senderUserId: l.senderUserId,
        platform: l.platform,
        provider: l.provider,
        environment: l.environment,
        category: l.category,
        targetType: l.targetType,
        target: l.target,
        notification: l.notification,
        data: l.data,
        successCount: l.successCount,
        failureCount: l.failureCount,
        result: l.result,
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing push logs:', error);
    return NextResponse.json({ error: 'Failed to list logs' }, { status: 500 });
  }
}
