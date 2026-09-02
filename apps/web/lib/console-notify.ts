import { getDataManager } from './data-manager';

const CHANNEL = 'itrade_config_changed';

export type NotifyPayload =
  | { kind: 'account'; userId: string }
  | { kind: 'strategy'; userId: string; strategyId: number };

/**
 * Fire-and-forget: publish a PG NOTIFY to wake the console.
 * Never throws; failures are logged but MUST NOT 500 the request —
 * the console's polling fallback (60s default, 600s in prod) will
 * pick up the change even if this notify is lost.
 */
export async function notifyConfigChange(payload: NotifyPayload): Promise<void> {
  try {
    const dm = await getDataManager();
    await dm.dataSource.query(`SELECT pg_notify($1, $2)`, [
      CHANNEL,
      JSON.stringify(payload),
    ]);
  } catch (err) {
    console.warn(
      '[console-notify] pg_notify failed (polling fallback will recover)',
      err,
    );
  }
}
