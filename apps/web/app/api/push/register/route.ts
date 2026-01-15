import { NextRequest, NextResponse } from 'next/server';
import { PushEnvironment, PushPlatform, PushProvider } from '@itrade/data-manager';

import { auth } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RegisterBody = {
  deviceId?: string;
  platform?: string;
  provider?: string;
  pushToken?: string;
  appId?: string;
  appVersion?: string;
  environment?: string | null;
};

function isPushPlatform(value: string): value is PushPlatform {
  return (
    value === PushPlatform.IOS ||
    value === PushPlatform.ANDROID ||
    value === PushPlatform.WEB
  );
}

function isPushProvider(value: string): value is PushProvider {
  return (
    value === PushProvider.FCM ||
    value === PushProvider.APNS ||
    value === PushProvider.WEBPUSH
  );
}

function isPushEnvironment(value: string): value is PushEnvironment {
  return value === PushEnvironment.SANDBOX || value === PushEnvironment.PRODUCTION;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api
      .getSession({ headers: request.headers })
      .catch(() => null);

    const body = (await request.json()) as RegisterBody;

    const deviceId = body.deviceId?.trim();
    const platformRaw = body.platform?.trim();
    const providerRaw = body.provider?.trim();
    const pushToken = body.pushToken?.trim();
    const appId = body.appId?.trim();
    const appVersion = body.appVersion?.trim() || null;

    if (!deviceId || deviceId.length > 64) {
      return NextResponse.json({ error: 'Invalid deviceId' }, { status: 400 });
    }
    if (!platformRaw || !isPushPlatform(platformRaw)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }
    if (!providerRaw || !isPushProvider(providerRaw)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }
    if (!pushToken) {
      return NextResponse.json({ error: 'Invalid pushToken' }, { status: 400 });
    }
    if (!appId || appId.length > 64) {
      return NextResponse.json({ error: 'Invalid appId' }, { status: 400 });
    }
    if (appVersion && appVersion.length > 32) {
      return NextResponse.json({ error: 'Invalid appVersion' }, { status: 400 });
    }

    const environmentRaw = body.environment?.trim() ?? null;
    const environment =
      environmentRaw == null || environmentRaw === '' ? null : environmentRaw;

    if (environment != null && !isPushEnvironment(environment)) {
      return NextResponse.json({ error: 'Invalid environment' }, { status: 400 });
    }

    const dataManager = await getDataManager();
    const repo = dataManager.getPushDeviceRepository();

    const entity = await repo.register({
      userId: session?.user?.id ?? null,
      deviceId,
      platform: platformRaw,
      provider: providerRaw,
      pushToken,
      appId,
      appVersion,
      environment,
      lastSeenAt: new Date(),
      isActive: true,
    });

    return NextResponse.json({
      success: true,
      id: entity.id,
    });
  } catch (error) {
    console.error('Error registering push token:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to register push token',
        message: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
