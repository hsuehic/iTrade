// Async Utility Functions

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retry<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T>,
  options: {
    maxAttempts?: number;
    delay?: number;
    backoff?: 'fixed' | 'linear' | 'exponential';
    maxDelay?: number;
    shouldRetry?: (error: Error, attempt: number) => boolean;
    till?: (result: T, attempt: number) => boolean;
  } = {},
): (...args: Args) => Promise<T> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 'fixed',
    maxDelay = 30000,
    shouldRetry = () => true,
    till = () => true,
  } = options;

  return async (...args: Args): Promise<T> => {
    let lastError: Error;
    let lastResult: T;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        lastResult = await fn(...args);
        if (till(lastResult, attempt)) {
          return lastResult;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (error instanceof Error) {
          console.error(
            `Attempt ${attempt} failed with error:`,
            error.stack || error.message,
          );
        } else {
          console.error(`Attempt ${attempt} failed with non-Error:`, error);
        }

        if (attempt === maxAttempts || !shouldRetry(lastError, attempt)) {
          throw lastError;
        }

        // Calculate delay for next attempt
        const calculateNextDelay = (
          delay: number,
          attempt: number,
          backoff: string,
        ): number => {
          switch (backoff) {
            case 'linear':
              return delay * attempt;
            case 'exponential':
              return delay * Math.pow(2, attempt - 1);
            case 'fixed':
            default:
              return delay;
          }
        };
        let nextDelay = calculateNextDelay(delay, attempt, backoff);

        // Cap the delay at maxDelay
        if (maxDelay <= 0) {
          throw new Error('maxDelay must be a positive number');
        }
        nextDelay = Math.min(nextDelay, maxDelay);

        await sleep(nextDelay);
      }
    }

    throw lastError!;
  };
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate = false,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };

    const callNow = immediate && !timeout;

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(later, wait);

    if (callNow) {
      func(...args);
    }
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export async function timeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMessage = 'Operation timed out',
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), ms);
  });

  return Promise.race([promise, timeoutPromise]);
}

export async function parallel<T>(
  tasks: (() => Promise<T>)[],
  concurrency = Infinity,
): Promise<T[]> {
  if (concurrency >= tasks.length) {
    return Promise.all(tasks.map((task) => task()));
  }

  const results: T[] = new Array(tasks.length);
  const executing: Promise<void>[] = [];
  let index = 0;

  const executeNext = async (): Promise<void> => {
    const currentIndex = index++;
    const task = tasks[currentIndex];

    if (!task) return;

    results[currentIndex] = await task();
  };

  // Start initial batch
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    executing.push(executeNext());
  }

  // Process remaining tasks
  while (executing.length > 0) {
    await Promise.race(executing);

    // Remove completed tasks and add new ones
    const completedIndex = executing.findIndex(async (p) => {
      try {
        await p;
        return true;
      } catch {
        return true;
      }
    });

    if (completedIndex !== -1) {
      executing.splice(completedIndex, 1);
    }

    if (index < tasks.length) {
      executing.push(executeNext());
    }
  }

  return results;
}

export async function sequential<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = [];

  for (const task of tasks) {
    const result = await task();
    results.push(result);
  }

  return results;
}

export async function waterfall<T>(
  tasks: ((prev: any) => Promise<T>)[],
  initialValue: any = undefined,
): Promise<T> {
  let result = initialValue;

  for (const task of tasks) {
    result = await task(result);
  }

  return result;
}

export function memoize<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string,
  ttl?: number,
): T {
  const cache = new Map<string, { value: any; timestamp: number }>();

  const defaultKeyGenerator = (...args: any[]) => JSON.stringify(args);
  const getKey = keyGenerator || defaultKeyGenerator;

  return (async (...args: Parameters<T>) => {
    const key = getKey(...args);
    const cached = cache.get(key);

    if (cached && (!ttl || Date.now() - cached.timestamp < ttl)) {
      return cached.value;
    }

    const result = await fn(...args);
    cache.set(key, { value: result, timestamp: Date.now() });

    return result;
  }) as T;
}

export class AsyncQueue<T> {
  private queue: (() => Promise<T>)[] = [];
  private processing = false;
  private concurrency: number;
  private running = 0;
  private results: T[] = [];

  constructor(concurrency = 1) {
    this.concurrency = concurrency;
  }

  add(task: () => Promise<T>): void {
    this.queue.push(task);
    this.process();
  }

  private async process(): Promise<void> {
    if (this.processing || this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    this.running++;

    const task = this.queue.shift()!;

    try {
      const result = await task();
      this.results.push(result);
    } catch (error) {
      console.error('Task failed:', error);
    } finally {
      this.running--;
      this.processing = false;

      if (this.queue.length > 0) {
        setImmediate(() => this.process());
      }
    }
  }

  async wait(): Promise<T[]> {
    while (this.queue.length > 0 || this.running > 0) {
      await sleep(10);
    }
    return [...this.results];
  }

  size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }
}

// Deep clone utility
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  if (obj instanceof Array) {
    return obj.map((item) => deepClone(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const cloned = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }

  return obj;
}

// Deep merge utility
export function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = deepClone(target);

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key];

      if (sourceValue === null || sourceValue === undefined) {
        continue;
      }

      if (
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key]) &&
        result[key] !== null
      ) {
        result[key] = deepMerge(result[key], sourceValue as any);
      } else {
        result[key] = deepClone(sourceValue) as any;
      }
    }
  }

  return result;
}

// Event emitter with async support
export class AsyncEventEmitter {
  private events = new Map<string, ((...args: any[]) => Promise<void>)[]>();

  on(event: string, listener: (...args: any[]) => Promise<void>): void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(listener);
  }

  off(event: string, listener: (...args: any[]) => Promise<void>): void {
    const listeners = this.events.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  async emit(event: string, ...args: any[]): Promise<void> {
    const listeners = this.events.get(event);
    if (listeners) {
      await Promise.all(listeners.map((listener) => listener(...args)));
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }

  listenerCount(event: string): number {
    return this.events.get(event)?.length || 0;
  }
}
