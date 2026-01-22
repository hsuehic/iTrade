import { DataSource, Repository } from 'typeorm';

import {
  PushNotificationLogEntity,
  PushNotificationCategory,
} from '../entities/PushNotificationLog';

export interface GetNotificationsOptions {
  userId: string;
  isRead?: boolean;
  category?: PushNotificationCategory;
  limit?: number;
  offset?: number;
}

export interface UnreadCountResult {
  total: number;
  byCategory: Record<PushNotificationCategory, number>;
}

export class PushNotificationRepository {
  private repository: Repository<PushNotificationLogEntity>;

  constructor(dataSource: DataSource) {
    this.repository = dataSource.getRepository(PushNotificationLogEntity);
  }

  /**
   * Get the count of unread notifications for a user.
   * This is used for badge count in mobile apps.
   */
  async getUnreadCount(userId: string): Promise<number> {
    return await this.repository.count({
      where: {
        senderUserId: userId,
        isRead: false,
      },
    });
  }

  /**
   * Get unread count with breakdown by category.
   */
  async getUnreadCountByCategory(userId: string): Promise<UnreadCountResult> {
    const results = await this.repository
      .createQueryBuilder('n')
      .select('n.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('n.senderUserId = :userId', { userId })
      .andWhere('n.isRead = false')
      .groupBy('n.category')
      .getRawMany<{ category: PushNotificationCategory; count: string }>();

    const byCategory: Record<PushNotificationCategory, number> = {
      general: 0,
      marketing: 0,
      trading: 0,
      security: 0,
      system: 0,
    };

    let total = 0;
    for (const row of results) {
      const count = parseInt(row.count, 10);
      byCategory[row.category] = count;
      total += count;
    }

    return { total, byCategory };
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(notificationId: string): Promise<void> {
    await this.repository.update(
      { id: notificationId },
      { isRead: true, readAt: new Date() },
    );
  }

  /**
   * Mark multiple notifications as read.
   */
  async markMultipleAsRead(notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) return;

    await this.repository
      .createQueryBuilder()
      .update(PushNotificationLogEntity)
      .set({ isRead: true, readAt: new Date() })
      .where('id IN (:...ids)', { ids: notificationIds })
      .execute();
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllAsRead(
    userId: string,
    category?: PushNotificationCategory,
  ): Promise<number> {
    const qb = this.repository
      .createQueryBuilder()
      .update(PushNotificationLogEntity)
      .set({ isRead: true, readAt: new Date() })
      .where('senderUserId = :userId', { userId })
      .andWhere('isRead = false');

    if (category) {
      qb.andWhere('category = :category', { category });
    }

    const result = await qb.execute();
    return result.affected ?? 0;
  }

  /**
   * Get notifications for a user with pagination.
   */
  async getNotifications(options: GetNotificationsOptions): Promise<{
    notifications: PushNotificationLogEntity[];
    total: number;
    unreadCount: number;
  }> {
    const { userId, isRead, category, limit = 20, offset = 0 } = options;

    const qb = this.repository
      .createQueryBuilder('n')
      .where('n.senderUserId = :userId', { userId });

    if (isRead !== undefined) {
      qb.andWhere('n.isRead = :isRead', { isRead });
    }

    if (category) {
      qb.andWhere('n.category = :category', { category });
    }

    qb.orderBy('n.createdAt', 'DESC').skip(offset).take(limit);

    const [notifications, total] = await qb.getManyAndCount();

    // Get unread count separately for efficiency
    const unreadCount = await this.getUnreadCount(userId);

    return { notifications, total, unreadCount };
  }

  /**
   * Get a single notification by ID.
   */
  async getById(notificationId: string): Promise<PushNotificationLogEntity | null> {
    return await this.repository.findOne({
      where: { id: notificationId },
    });
  }

  /**
   * Delete old notifications (cleanup).
   * @param olderThanDays Delete notifications older than this many days
   */
  async deleteOldNotifications(olderThanDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .from(PushNotificationLogEntity)
      .where('createdAt < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected ?? 0;
  }
}
