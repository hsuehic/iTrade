import { DataSource, Repository } from 'typeorm';

import { EmailPreferencesEntity } from '../entities/EmailPreferences';

export interface EmailPreferencesData {
  tradingAlerts?: boolean;
  priceAlerts?: boolean;
  orderUpdates?: boolean;
  accountActivity?: boolean;
  weeklyReports?: boolean;
  productUpdates?: boolean;
  newsAndTips?: boolean;
  marketingEmails?: boolean;
}

export class EmailPreferencesRepository {
  private repository: Repository<EmailPreferencesEntity>;

  constructor (dataSource: DataSource) {
    this.repository = dataSource.getRepository(EmailPreferencesEntity);
  }

  /**
   * Get email preferences for a user
   * Creates default preferences if they don't exist
   */
  async getByUserId(userId: string): Promise<EmailPreferencesEntity> {
    let preferences = await this.repository.findOne({
      where: { userId },
    });

    // Create default preferences if they don't exist
    if (!preferences) {
      preferences = await this.create(userId, {});
    }

    return preferences;
  }

  /**
   * Create email preferences for a user with optional initial values
   * If preferences already exist, returns the existing preferences
   */
  async create(
    userId: string,
    data: EmailPreferencesData = {}
  ): Promise<EmailPreferencesEntity> {
    // Check if preferences already exist
    const existing = await this.repository.findOne({
      where: { userId },
    });

    if (existing) {
      console.log(`Email preferences already exist for user: ${userId}`);
      return existing;
    }

    const entity = this.repository.create({
      userId,
      tradingAlerts: data.tradingAlerts ?? true,
      priceAlerts: data.priceAlerts ?? true,
      orderUpdates: data.orderUpdates ?? true,
      accountActivity: data.accountActivity ?? true,
      weeklyReports: data.weeklyReports ?? true,
      productUpdates: data.productUpdates ?? false,
      newsAndTips: data.newsAndTips ?? true,
      marketingEmails: data.marketingEmails ?? true,
    });

    return await this.repository.save(entity);
  }

  /**
   * Update email preferences for a user
   */
  async update(
    userId: string,
    data: EmailPreferencesData
  ): Promise<EmailPreferencesEntity> {
    // Get existing preferences (creates if doesn't exist)
    const existing = await this.getByUserId(userId);

    // Update with new values
    const updated = this.repository.merge(existing, data);

    return await this.repository.save(updated);
  }

  /**
   * Delete email preferences for a user
   */
  async delete(userId: string): Promise<void> {
    await this.repository.delete({ userId });
  }

  /**
   * Check if user has specific preference enabled
   */
  async isPreferenceEnabled(
    userId: string,
    preference: keyof EmailPreferencesData
  ): Promise<boolean> {
    const preferences = await this.getByUserId(userId);
    return preferences[preference] ?? false;
  }
}

