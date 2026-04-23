import { PaperTradingSessionManager } from './paper-trading-session-manager';
import { getDataManager } from '@/lib/data-manager';

const globalForPaperTrading = globalThis as unknown as {
  paperTradingManager: PaperTradingSessionManager | undefined;
};

/**
 * Get singleton instance of PaperTradingSessionManager
 */
export async function getPaperTradingManager(): Promise<PaperTradingSessionManager> {
  if (!globalForPaperTrading.paperTradingManager) {
    const dataManager = await getDataManager();
    globalForPaperTrading.paperTradingManager = new PaperTradingSessionManager(
      dataManager,
    );

    // Fire and forget restore process so it doesn't block initialization indefinitely
    globalForPaperTrading.paperTradingManager
      .restoreActiveSessions()
      .catch(console.error);
  }
  return globalForPaperTrading.paperTradingManager;
}

/**
 * Cleanup function for graceful shutdown
 */
export async function cleanupPaperTradingManager(): Promise<void> {
  if (globalForPaperTrading.paperTradingManager) {
    await globalForPaperTrading.paperTradingManager.stopAllSessions();
    globalForPaperTrading.paperTradingManager = undefined;
  }
}
