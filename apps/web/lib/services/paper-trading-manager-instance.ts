import { PaperTradingSessionManager } from './paper-trading-session-manager';
import { getDataManager } from '@/lib/data-manager';

let paperTradingManager: PaperTradingSessionManager | null = null;

/**
 * Get singleton instance of PaperTradingSessionManager
 */
export async function getPaperTradingManager(): Promise<PaperTradingSessionManager> {
  if (!paperTradingManager) {
    const dataManager = await getDataManager();
    paperTradingManager = new PaperTradingSessionManager(dataManager);
  }
  return paperTradingManager;
}

/**
 * Cleanup function for graceful shutdown
 */
export async function cleanupPaperTradingManager(): Promise<void> {
  if (paperTradingManager) {
    await paperTradingManager.stopAllSessions();
    paperTradingManager = null;
  }
}
