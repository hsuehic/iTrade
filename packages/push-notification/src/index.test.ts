import { describe, expect, it } from 'vitest';

import { isPushEnabled } from './index';

describe('push-notification', () => {
  it('exposes isPushEnabled flag', () => {
    expect(typeof isPushEnabled()).toBe('boolean');
  });
});
