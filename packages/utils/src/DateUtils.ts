import moment from 'moment';
import 'moment-timezone';

export class DateUtils {
  // Date Formatting
  static formatTimestamp(date: Date | number, format = 'YYYY-MM-DD HH:mm:ss'): string {
    return moment(date).format(format);
  }

  static formatUTC(date: Date | number, format = 'YYYY-MM-DD HH:mm:ss'): string {
    return moment(date).utc().format(format);
  }

  static formatTimestampMs(timestampMs: number, format = 'YYYY-MM-DD HH:mm:ss'): string {
    return moment(timestampMs).format(format);
  }

  // Date Parsing
  static parseTimestamp(dateString: string): Date {
    return moment(dateString).toDate();
  }

  static parseUTC(dateString: string): Date {
    return moment.utc(dateString).toDate();
  }

  static parseUnixTimestamp(timestamp: number): Date {
    return moment.unix(timestamp).toDate();
  }

  // Date Calculations
  static addDays(date: Date, days: number): Date {
    return moment(date).add(days, 'days').toDate();
  }

  static addHours(date: Date, hours: number): Date {
    return moment(date).add(hours, 'hours').toDate();
  }

  static addMinutes(date: Date, minutes: number): Date {
    return moment(date).add(minutes, 'minutes').toDate();
  }

  static subtractDays(date: Date, days: number): Date {
    return moment(date).subtract(days, 'days').toDate();
  }

  static diffInDays(date1: Date, date2: Date): number {
    return moment(date1).diff(moment(date2), 'days');
  }

  static diffInHours(date1: Date, date2: Date): number {
    return moment(date1).diff(moment(date2), 'hours');
  }

  static diffInMinutes(date1: Date, date2: Date): number {
    return moment(date1).diff(moment(date2), 'minutes');
  }

  static diffInSeconds(date1: Date, date2: Date): number {
    return moment(date1).diff(moment(date2), 'seconds');
  }

  // Date Validation
  static isValidDate(date: any): boolean {
    return moment(date).isValid();
  }

  static isBefore(date1: Date, date2: Date): boolean {
    return moment(date1).isBefore(moment(date2));
  }

  static isAfter(date1: Date, date2: Date): boolean {
    return moment(date1).isAfter(moment(date2));
  }

  static isSameDay(date1: Date, date2: Date): boolean {
    return moment(date1).isSame(moment(date2), 'day');
  }

  // Trading Time Utilities
  static isWeekend(date: Date): boolean {
    const dayOfWeek = moment(date).day();
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
  }

  static isWeekday(date: Date): boolean {
    return !this.isWeekend(date);
  }

  static getNextWeekday(date: Date): Date {
    let nextDay = moment(date).add(1, 'day');
    while (this.isWeekend(nextDay.toDate())) {
      nextDay = nextDay.add(1, 'day');
    }
    return nextDay.toDate();
  }

  static getPreviousWeekday(date: Date): Date {
    let prevDay = moment(date).subtract(1, 'day');
    while (this.isWeekend(prevDay.toDate())) {
      prevDay = prevDay.subtract(1, 'day');
    }
    return prevDay.toDate();
  }

  // Market Hours (Crypto markets are 24/7, but useful for traditional markets)
  static isMarketHours(date: Date, timezone = 'America/New_York'): boolean {
    const marketTime = moment(date).tz(timezone);
    const hour = marketTime.hour();
    const dayOfWeek = marketTime.day();

    // Traditional market hours: 9:30 AM - 4:00 PM, Monday-Friday
    return dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 9 && hour < 16;
  }

  // Time Range Generation
  static generateDateRange(
    startDate: Date,
    endDate: Date,
    interval: 'day' | 'hour' | 'minute' = 'day',
  ): Date[] {
    const dates: Date[] = [];
    let current = moment(startDate);
    const end = moment(endDate);

    while (current.isSameOrBefore(end)) {
      dates.push(current.toDate());
      current = current.add(1, interval);
    }

    return dates;
  }

  static generateTradingDateRange(startDate: Date, endDate: Date): Date[] {
    return this.generateDateRange(startDate, endDate, 'day').filter((date) =>
      this.isWeekday(date),
    );
  }

  // Time Zone Utilities
  static convertToTimezone(date: Date, timezone: string): Date {
    return moment(date).tz(timezone).toDate();
  }

  static getTimezoneOffset(date: Date, timezone: string): number {
    return moment(date).tz(timezone).utcOffset();
  }

  // Period Helpers
  static getStartOfDay(date: Date): Date {
    return moment(date).startOf('day').toDate();
  }

  static getEndOfDay(date: Date): Date {
    return moment(date).endOf('day').toDate();
  }

  static getStartOfWeek(date: Date): Date {
    return moment(date).startOf('week').toDate();
  }

  static getEndOfWeek(date: Date): Date {
    return moment(date).endOf('week').toDate();
  }

  static getStartOfMonth(date: Date): Date {
    return moment(date).startOf('month').toDate();
  }

  static getEndOfMonth(date: Date): Date {
    return moment(date).endOf('month').toDate();
  }

  static getStartOfYear(date: Date): Date {
    return moment(date).startOf('year').toDate();
  }

  static getEndOfYear(date: Date): Date {
    return moment(date).endOf('year').toDate();
  }

  // Relative Time
  static getRelativeTime(date: Date): string {
    return moment(date).fromNow();
  }

  static getTimeTo(date: Date): string {
    return moment(date).toNow();
  }

  // Duration Formatting
  static formatDuration(durationMs: number): string {
    const duration = moment.duration(durationMs);

    if (duration.asDays() >= 1) {
      return `${Math.floor(duration.asDays())}d ${duration.hours()}h ${duration.minutes()}m`;
    } else if (duration.asHours() >= 1) {
      return `${duration.hours()}h ${duration.minutes()}m ${duration.seconds()}s`;
    } else if (duration.asMinutes() >= 1) {
      return `${duration.minutes()}m ${duration.seconds()}s`;
    } else {
      return `${duration.seconds()}s`;
    }
  }

  static formatShortDuration(durationMs: number): string {
    const duration = moment.duration(durationMs);

    if (duration.asDays() >= 1) {
      return `${Math.floor(duration.asDays())}d`;
    } else if (duration.asHours() >= 1) {
      return `${Math.floor(duration.asHours())}h`;
    } else if (duration.asMinutes() >= 1) {
      return `${Math.floor(duration.asMinutes())}m`;
    } else {
      return `${Math.floor(duration.asSeconds())}s`;
    }
  }

  // Candle/Bar Time Utilities
  static getNextCandleTime(currentTime: Date, interval: string): Date {
    const intervalMs = this.intervalToMilliseconds(interval);
    const currentMs = currentTime.getTime();
    const nextCandleMs = Math.ceil(currentMs / intervalMs) * intervalMs;
    return new Date(nextCandleMs);
  }

  static getCandleStartTime(time: Date, interval: string): Date {
    const intervalMs = this.intervalToMilliseconds(interval);
    const timeMs = time.getTime();
    const candleStartMs = Math.floor(timeMs / intervalMs) * intervalMs;
    return new Date(candleStartMs);
  }

  static intervalToMilliseconds(interval: string): number {
    const match = interval.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid interval format: ${interval}`);
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        throw new Error(`Unknown interval unit: ${unit}`);
    }
  }

  // Business Day Calculations
  static addBusinessDays(date: Date, days: number): Date {
    let result = moment(date);
    let remainingDays = days;

    while (remainingDays > 0) {
      result = result.add(1, 'day');
      if (this.isWeekday(result.toDate())) {
        remainingDays--;
      }
    }

    return result.toDate();
  }

  static getBusinessDaysBetween(startDate: Date, endDate: Date): number {
    let count = 0;
    let current = moment(startDate);
    const end = moment(endDate);

    while (current.isBefore(end)) {
      if (this.isWeekday(current.toDate())) {
        count++;
      }
      current = current.add(1, 'day');
    }

    return count;
  }

  // Utility Methods
  static now(): Date {
    return new Date();
  }

  static nowUTC(): Date {
    return moment.utc().toDate();
  }

  static timestamp(): number {
    return Date.now();
  }

  static unixTimestamp(): number {
    return Math.floor(Date.now() / 1000);
  }
}
