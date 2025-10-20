import { getDataManager } from './data-manager';

/**
 * Initialize user data after sign-up
 * This creates default email preferences for new users
 */
export async function initializeUserData(userId: string): Promise<void> {
  try {
    const dataManager = await getDataManager();
    const emailPrefsRepo = dataManager.getEmailPreferencesRepository();

    // Create email preferences with defaults
    await emailPrefsRepo.create(userId, {
      tradingAlerts: true,
      priceAlerts: true,
      orderUpdates: true,
      accountActivity: true,
      weeklyReports: true,
      productUpdates: false,
      newsAndTips: true,
      marketingEmails: true,
    });

    console.log(`✅ User data initialized for user: ${userId}`);
  } catch (error) {
    console.error('❌ Error initializing user data:', error);
    // Don't throw - user creation should succeed even if preferences fail
  }
}

/**
 * Clean up user data when account is deleted
 */
export async function cleanupUserData(userId: string): Promise<void> {
  try {
    const dataManager = await getDataManager();
    const emailPrefsRepo = dataManager.getEmailPreferencesRepository();

    // Delete email preferences
    await emailPrefsRepo.delete(userId);

    console.log(`✅ User data cleaned up for user: ${userId}`);
  } catch (error) {
    console.error('❌ Error cleaning up user data:', error);
  }
}

