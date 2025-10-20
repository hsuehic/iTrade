/**
 * Fixed length list (FIFO - First In First Out)
 * When the list exceeds the maximum length, the oldest item is automatically removed
 *
 * @example
 * ```ts
 * const list = new FixedLengthList<number>(3);
 * list.push(1, 2, 3, 4); // [2, 3, 4] - oldest item (1) was removed
 * ```
 */
export class FixedLengthList<T> {
  private readonly list: T[] = [];

  /**
   * Create a fixed length list
   * @param maxLength Maximum length of the list
   * @param initialItems Optional initial items
   */
  constructor(
    private readonly maxLength: number,
    initialItems?: T[],
  ) {
    if (maxLength <= 0) {
      throw new Error('Max length must be greater than 0');
    }

    if (initialItems && initialItems.length > 0) {
      // Only keep the last maxLength items
      const startIndex = Math.max(0, initialItems.length - maxLength);
      this.list.push(...initialItems.slice(startIndex));
    }
  }

  /**
   * Add one or more items to the list
   * If the list exceeds max length, oldest items are removed
   */
  push(...items: T[]): void {
    this.list.push(...items);

    // Remove oldest items if exceeded max length
    while (this.list.length > this.maxLength) {
      this.list.shift();
    }
  }

  /**
   * Add an item to the list (alias for push)
   */
  add(item: T): void {
    this.push(item);
  }

  /**
   * Remove the first occurrence of an item from the list
   * @returns true if item was found and removed, false otherwise
   */
  remove(item: T): boolean {
    const index = this.list.indexOf(item);
    if (index !== -1) {
      this.list.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Remove item at specific index
   */
  removeAt(index: number): T | undefined {
    if (index < 0 || index >= this.list.length) {
      return undefined;
    }
    return this.list.splice(index, 1)[0];
  }

  /**
   * Get item at specific index
   */
  get(index: number): T | undefined {
    return this.list[index];
  }

  /**
   * Get the first item in the list (oldest)
   */
  first(): T | undefined {
    return this.list[0];
  }

  /**
   * Get the last item in the list (newest)
   */
  last(): T | undefined {
    return this.list[this.list.length - 1];
  }

  /**
   * Get the current size of the list
   */
  get size(): number {
    return this.list.length;
  }

  /**
   * Get the maximum length of the list
   */
  get capacity(): number {
    return this.maxLength;
  }

  /**
   * Check if the list is full
   */
  isFull(): boolean {
    return this.list.length >= this.maxLength;
  }

  /**
   * Check if the list is empty
   */
  isEmpty(): boolean {
    return this.list.length === 0;
  }

  /**
   * Clear all items from the list
   */
  clear(): void {
    this.list.length = 0;
  }

  /**
   * Get a copy of the list as an array
   */
  toArray(): T[] {
    return [...this.list];
  }

  /**
   * Check if the list contains an item
   */
  contains(item: T): boolean {
    return this.list.includes(item);
  }

  /**
   * Find an item using a predicate function
   */
  find(predicate: (item: T, index: number) => boolean): T | undefined {
    return this.list.find(predicate);
  }

  /**
   * Filter items using a predicate function
   * Returns a new array with matching items
   */
  filter(predicate: (item: T, index: number) => boolean): T[] {
    return this.list.filter(predicate);
  }

  /**
   * Map items to a new array
   */
  map<U>(mapper: (item: T, index: number) => U): U[] {
    return this.list.map(mapper);
  }

  /**
   * Reduce the list to a single value
   */
  reduce<U>(reducer: (accumulator: U, item: T, index: number) => U, initialValue: U): U {
    return this.list.reduce(reducer, initialValue);
  }

  /**
   * Execute a function for each item
   */
  forEach(callback: (item: T, index: number) => void): void {
    this.list.forEach(callback);
  }

  /**
   * Check if some items match the predicate
   */
  some(predicate: (item: T, index: number) => boolean): boolean {
    return this.list.some(predicate);
  }

  /**
   * Check if all items match the predicate
   */
  every(predicate: (item: T, index: number) => boolean): boolean {
    return this.list.every(predicate);
  }

  /**
   * Get an iterator for the list
   */
  [Symbol.iterator](): Iterator<T> {
    return this.list[Symbol.iterator]();
  }

  /**
   * Convert the list to a string representation
   */
  toString(): string {
    return `FixedLengthList(${this.size}/${this.maxLength}) [${this.list.join(', ')}]`;
  }
}

/**
 * Utility functions for array operations
 */
export class ArrayUtils {
  /**
   * Chunk an array into smaller arrays of specified size
   */
  static chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Remove duplicates from an array
   */
  static unique<T>(array: T[]): T[] {
    return Array.from(new Set(array));
  }

  /**
   * Shuffle an array (Fisher-Yates algorithm)
   */
  static shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Group array items by a key function
   */
  static groupBy<T, K extends string | number | symbol>(
    array: T[],
    keyFn: (item: T) => K,
  ): Record<K, T[]> {
    return array.reduce(
      (groups, item) => {
        const key = keyFn(item);
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(item);
        return groups;
      },
      {} as Record<K, T[]>,
    );
  }

  /**
   * Get the last N items from an array
   */
  static takeLast<T>(array: T[], count: number): T[] {
    return array.slice(-count);
  }

  /**
   * Get the first N items from an array
   */
  static takeFirst<T>(array: T[], count: number): T[] {
    return array.slice(0, count);
  }

  /**
   * Remove falsy values from an array
   */
  static compact<T>(array: (T | null | undefined | false | '' | 0)[]): T[] {
    return array.filter(Boolean) as T[];
  }

  /**
   * Find the intersection of multiple arrays
   */
  static intersection<T>(...arrays: T[][]): T[] {
    if (arrays.length === 0) return [];
    if (arrays.length === 1) return arrays[0];

    const [first, ...rest] = arrays;
    return first.filter((item) => rest.every((arr) => arr.includes(item)));
  }

  /**
   * Find the difference between two arrays (items in first but not in second)
   */
  static difference<T>(first: T[], second: T[]): T[] {
    return first.filter((item) => !second.includes(item));
  }

  /**
   * Flatten a nested array
   */
  static flatten<T>(array: (T | T[])[]): T[] {
    return array.flat() as T[];
  }

  /**
   * Deep flatten a nested array
   */
  static flattenDeep<T>(array: any[]): T[] {
    return array.flat(Infinity) as T[];
  }
}
