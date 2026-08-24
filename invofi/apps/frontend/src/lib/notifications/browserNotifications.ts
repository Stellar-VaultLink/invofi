// ── Browser Notification API wrapper (issue #255) ────────────────────────────
// Thin, testable wrapper around window.Notification so components never call
// the native API directly. Fails gracefully when the API is absent or denied.

/**
 * The three possible states of the OS notification permission.
 * Matches the native Notification.permission strings.
 */
export type NotificationPermission = 'default' | 'granted' | 'denied';

/**
 * True when the browser supports the Notification API.
 * Always false in SSR (no `window`) or when window.Notification is falsy.
 */
export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.Notification === 'function';
}

/**
 * Returns the current permission state, or `'denied'` as a safe default
 * when the API is not available.
 */
export function getBrowserNotificationPermission(): NotificationPermission {
  if (!isBrowserNotificationSupported()) return 'denied';
  return window.Notification.permission as NotificationPermission;
}

/**
 * Requests browser notification permission from the user.
 *
 * - Resolves immediately with `'denied'` when unsupported or already denied.
 * - Resolves with the granted/denied result after the user responds to the
 *   browser prompt.
 * - Never rejects — callers can treat any result safely.
 */
export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
  if (!isBrowserNotificationSupported()) return 'denied';
  if (window.Notification.permission === 'granted') return 'granted';
  if (window.Notification.permission === 'denied') return 'denied';


  try {
    const result = await window.Notification.requestPermission();
    return result as NotificationPermission;
  } catch {
    // Some browsers (e.g. Firefox in private windows) throw on requestPermission.
    return 'denied';
  }
}

export interface BrowserNotificationOptions {
  /** Short headline shown in the OS notification. */
  title: string;
  /** Supporting body text. */
  body: string;
  /**
   * Deduplication tag: the OS replaces an existing notification that has the
   * same tag instead of stacking a new one.
   */
  tag?: string;
}

/**
 * Fire an OS-level browser notification.
 *
 * Returns `true` when the notification was sent, `false` when skipped
 * (unsupported, denied, or the page is currently focused — in-app toasts
 * are sufficient in that case).
 */
export function sendBrowserNotification(opts: BrowserNotificationOptions): boolean {
  if (!isBrowserNotificationSupported()) return false;
  if (window.Notification.permission !== 'granted') return false;

  // Skip when the user is actively looking at the tab — the in-app toast
  // is already visible.
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    return false;
  }

  try {
    new window.Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      icon: '/icon.png',
    });
    return true;
  } catch {
    // Constructing Notification can throw in some sandboxed environments.
    return false;
  }
}
