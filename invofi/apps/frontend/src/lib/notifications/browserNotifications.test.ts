// ── Browser notification API unit tests (issue #255) ─────────────────────────
// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  isBrowserNotificationSupported,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  sendBrowserNotification,
} from '@/lib/notifications/browserNotifications';

// ── Mock helpers ──────────────────────────────────────────────────────────────

type NotifPermission = 'default' | 'granted' | 'denied';

function mockNotificationAPI(permission: NotifPermission = 'default') {
  const requestPermission = vi.fn().mockResolvedValue(permission);
  const MockNotification = vi.fn() as unknown as {
    new (title: string, options?: NotificationOptions): Notification;
    permission: NotifPermission;
    requestPermission: typeof requestPermission;
  };
  (MockNotification as unknown as Record<string, unknown>).permission = permission;
  (MockNotification as unknown as Record<string, unknown>).requestPermission = requestPermission;

  Object.defineProperty(window, 'Notification', {
    value: MockNotification,
    writable: true,
    configurable: true,
  });

  return { MockNotification, requestPermission };
}

function removeNotificationAPI() {
  try {
    Object.defineProperty(window, 'Notification', {
      value: undefined,
      writable: true,
      configurable: true,
    });
  } catch {
    // Ignore — best effort
  }
}

// ── isBrowserNotificationSupported ───────────────────────────────────────────

describe('isBrowserNotificationSupported', () => {
  afterEach(() => {
    removeNotificationAPI();
  });

  it('returns true when Notification is in window', () => {
    mockNotificationAPI();
    expect(isBrowserNotificationSupported()).toBe(true);
  });

  it('returns false when Notification is absent', () => {
    removeNotificationAPI();
    expect(isBrowserNotificationSupported()).toBe(false);
  });
});

// ── getBrowserNotificationPermission ─────────────────────────────────────────

describe('getBrowserNotificationPermission', () => {
  afterEach(() => {
    removeNotificationAPI();
  });

  it('returns the current permission when supported', () => {
    mockNotificationAPI('granted');
    expect(getBrowserNotificationPermission()).toBe('granted');
  });

  it('returns "denied" when Notification is unsupported', () => {
    removeNotificationAPI();
    expect(getBrowserNotificationPermission()).toBe('denied');
  });
});

// ── requestBrowserNotificationPermission ─────────────────────────────────────

describe('requestBrowserNotificationPermission', () => {
  afterEach(() => {
    removeNotificationAPI();
  });

  it('returns "denied" immediately when API is unsupported', async () => {
    removeNotificationAPI();
    const result = await requestBrowserNotificationPermission();
    expect(result).toBe('denied');
  });

  it('returns "granted" immediately when already granted', async () => {
    mockNotificationAPI('granted');
    const result = await requestBrowserNotificationPermission();
    expect(result).toBe('granted');
  });

  it('returns "denied" immediately when already denied', async () => {
    mockNotificationAPI('denied');
    const result = await requestBrowserNotificationPermission();
    expect(result).toBe('denied');
  });

  it('calls requestPermission and returns its result when default', async () => {
    const { requestPermission } = mockNotificationAPI('default');
    requestPermission.mockResolvedValue('granted');
    const result = await requestBrowserNotificationPermission();
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(result).toBe('granted');
  });

  it('returns "denied" when requestPermission throws', async () => {
    const { requestPermission } = mockNotificationAPI('default');
    requestPermission.mockRejectedValue(new Error('blocked'));
    const result = await requestBrowserNotificationPermission();
    expect(result).toBe('denied');
  });
});

// ── sendBrowserNotification ───────────────────────────────────────────────────

describe('sendBrowserNotification', () => {
  beforeEach(() => {
    mockNotificationAPI('granted');
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
  });

  afterEach(() => {
    removeNotificationAPI();
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });

  it('returns false when API is not supported', () => {
    removeNotificationAPI();
    expect(sendBrowserNotification({ title: 'T', body: 'B' })).toBe(false);
  });

  it('returns false when permission is not granted', () => {
    mockNotificationAPI('default');
    expect(sendBrowserNotification({ title: 'T', body: 'B' })).toBe(false);
  });

  it('returns false when the tab is visible (in-app toast is sufficient)', () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    expect(sendBrowserNotification({ title: 'T', body: 'B' })).toBe(false);
  });

  it('instantiates Notification and returns true when all conditions are met', () => {
    const result = sendBrowserNotification({ title: 'Hello', body: 'World', tag: 'tag1' });
    expect(result).toBe(true);
    expect(window.Notification as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      'Hello',
      { body: 'World', tag: 'tag1', icon: '/icon.png' },
    );
  });

  it('returns false when constructing Notification throws', () => {
    (window.Notification as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('security error');
    });
    expect(sendBrowserNotification({ title: 'T', body: 'B' })).toBe(false);
  });
});
