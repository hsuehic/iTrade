import { NextRequest, NextResponse } from 'next/server';
import { PushDeviceEntity, PushPlatform, PushProvider } from '@itrade/data-manager';

import { getSession } from '@/lib/auth';
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
  const session = await getSession(request);
  if (!session?.user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const platformRaw = url.searchParams.get('platform');
  const providerRaw = url.searchParams.get('provider');
  const userId = url.searchParams.get('userId');
  const isActiveRaw = url.searchParams.get('isActive');
  const limit = Math.min(parseIntParam(url.searchParams.get('limit'), 50), 200);
  const offset = Math.max(parseIntParam(url.searchParams.get('offset'), 0), 0);

  const platform = platformRaw && isPlatform(platformRaw) ? platformRaw : undefined;
  const provider = providerRaw && isProvider(providerRaw) ? providerRaw : undefined;
  const isActive =
    isActiveRaw == null
      ? undefined
      : isActiveRaw === 'true'
        ? true
        : isActiveRaw === 'false'
          ? false
          : undefined;

  try {
    const dataManager = await getDataManager();
    const repo = dataManager.dataSource.getRepository(PushDeviceEntity);

    const qb = repo
      .createQueryBuilder('d')
      .orderBy('d.lastSeenAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (platform) qb.andWhere('d.platform = :platform', { platform });
    if (provider) qb.andWhere('d.provider = :provider', { provider });
    if (userId) qb.andWhere('d.userId = :userId', { userId });
    if (isActive != null) qb.andWhere('d.isActive = :isActive', { isActive });

    const [devices, total] = await qb.getManyAndCount();

    return NextResponse.json({
      devices: devices.map((d) => ({
        id: d.id,
        userId: d.userId,
        deviceId: d.deviceId,
        platform: d.platform,
        provider: d.provider,
        appId: d.appId,
        appVersion: d.appVersion ?? null,
        environment: d.environment,
        isActive: d.isActive,
        lastSeenAt: d.lastSeenAt ? d.lastSeenAt.toISOString() : null,
        createdAt: d.createdAt ? d.createdAt.toISOString() : null,
        updatedAt: d.updatedAt ? d.updatedAt.toISOString() : null,
      })),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing push devices:', error);
    return NextResponse.json(
      {
        error: 'Failed to list devices',
        details:
          process.env.NODE_ENV === 'development' &&
          error &&
          typeof error === 'object' &&
          'message' in error
            ? String(error.message)
            : undefined,
      },
      { status: 500 },
    );
  }
}
