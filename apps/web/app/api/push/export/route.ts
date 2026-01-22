import { NextRequest } from 'next/server';
import { PushDeviceEntity, PushNotificationLogEntity } from '@itrade/data-manager';

import { getSession } from '@/lib/auth';
import { getDataManager } from '@/lib/data-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'devices'; // devices | logs
  const format = url.searchParams.get('format') ?? 'csv'; // csv | json

  const dataManager = await getDataManager();

  if (type === 'devices') {
    const repo = dataManager.dataSource.getRepository(PushDeviceEntity);
    const rows = await repo
      .createQueryBuilder('d')
      .orderBy('d.lastSeenAt', 'DESC')
      .getMany();

    if (format === 'json') {
      return Response.json(rows);
    }

    const header = [
      'id',
      'userId',
      'deviceId',
      'platform',
      'provider',
      'appId',
      'appVersion',
      'environment',
      'isActive',
      'lastSeenAt',
      'createdAt',
      'updatedAt',
    ];
    const lines = [
      header.join(','),
      ...rows.map((d) =>
        [
          d.id,
          d.userId ?? '',
          d.deviceId,
          d.platform,
          d.provider,
          d.appId,
          d.appVersion ?? '',
          d.environment ?? '',
          d.isActive,
          d.lastSeenAt?.toISOString?.() ?? d.lastSeenAt,
          d.createdAt?.toISOString?.() ?? d.createdAt,
          d.updatedAt?.toISOString?.() ?? d.updatedAt,
        ]
          .map(csvEscape)
          .join(','),
      ),
    ];

    const filename = `push-devices-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  if (type === 'logs') {
    const repo = dataManager.dataSource.getRepository(PushNotificationLogEntity);
    const rows = await repo
      .createQueryBuilder('l')
      .orderBy('l.createdAt', 'DESC')
      .getMany();

    if (format === 'json') {
      return Response.json(rows);
    }

    const header = [
      'id',
      'createdAt',
      'senderUserId',
      'platform',
      'provider',
      'environment',
      'category',
      'targetType',
      'successCount',
      'failureCount',
      'target',
      'notification',
      'data',
      'result',
    ];
    const lines = [
      header.join(','),
      ...rows.map((l) =>
        [
          l.id,
          l.createdAt?.toISOString?.() ?? l.createdAt,
          l.senderUserId ?? '',
          l.platform,
          l.provider,
          l.environment ?? '',
          l.category ?? '',
          l.targetType,
          l.successCount,
          l.failureCount,
          JSON.stringify(l.target ?? {}),
          JSON.stringify(l.notification ?? null),
          JSON.stringify(l.data ?? null),
          JSON.stringify(l.result ?? null),
        ]
          .map(csvEscape)
          .join(','),
      ),
    ];

    const filename = `push-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  return new Response('Invalid type', { status: 400 });
}
