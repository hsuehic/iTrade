import EventEmitter from 'events';

export interface WSDataEvent<T = any> {
  market: 'spot' | 'futures';
  stream?: string;
  raw: T;
}

export class TypedEventEmitter<Events extends Record<string, (...args: any[]) => void>> {
  private emitter = new EventEmitter();
  on<K extends keyof Events>(event: K, listener: Events[K]): this {
    this.emitter.on(event as string, listener as any);
    return this;
  }
  off<K extends keyof Events>(event: K, listener: Events[K]): this {
    this.emitter.off(event as string, listener as any);
    return this;
  }
  emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>) {
    this.emitter.emit(event as string, ...args);
  }
}
