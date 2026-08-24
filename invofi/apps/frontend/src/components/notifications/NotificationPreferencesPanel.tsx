'use client';

// ── NotificationPreferencesPanel (issue #255) ─────────────────────────────────
// Per-event-type opt-in toggles + browser notification permission toggle.
// Rendered in the /settings page.

import { useCallback, useEffect, useState } from 'react';
import {
  requestBrowserNotificationPermission,
  getBrowserNotificationPermission,
  isBrowserNotificationSupported,
} from '@/lib/notifications/browserNotifications';
import { useNotifications } from '@/components/notifications/NotificationProvider';
import type { NotificationPreferences } from '@/types';

interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ id, label, description, checked, disabled = false, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-sm font-medium text-foreground cursor-pointer">
          {label}
        </label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-blue-600' : 'bg-input'}`}
      >
        <span
          aria-hidden
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
}

const PREF_ROWS: Array<{
  key: keyof Omit<NotificationPreferences, 'browserNotifications'>;
  label: string;
  description: string;
}> = [
  {
    key: 'offer_new',
    label: 'New offers',
    description: 'Notify me when a lender places an offer on one of my invoices.',
  },
  {
    key: 'offer_accepted',
    label: 'Offer accepted',
    description: 'Notify me when my financing offer is accepted by an originator.',
  },
  {
    key: 'offer_rejected',
    label: 'Offer rejected / withdrawn',
    description: 'Notify me when an offer is rejected or withdrawn.',
  },
  {
    key: 'invoice_overdue',
    label: 'Overdue & default alerts',
    description: 'Notify me when an invoice is marked overdue or defaults.',
  },
  {
    key: 'repayment',
    label: 'Repayment confirmed',
    description: 'Notify me when a repayment is confirmed on-chain.',
  },
  {
    key: 'dispute',
    label: 'Disputes',
    description: 'Notify me when a dispute is raised or resolved on one of my invoices.',
  },
];

export function NotificationPreferencesPanel() {
  const { preferences, setPreferences } = useNotifications();
  const [browserPermission, setBrowserPermission] = useState(getBrowserNotificationPermission());
  const [requestingPermission, setRequestingPermission] = useState(false);
  const supported = isBrowserNotificationSupported();

  // Sync permission state in case the user changed it externally.
  useEffect(() => {
    setBrowserPermission(getBrowserNotificationPermission());
  }, [preferences.browserNotifications]);

  const handleBrowserToggle = useCallback(async (on: boolean) => {
    if (on && browserPermission !== 'granted') {
      setRequestingPermission(true);
      const result = await requestBrowserNotificationPermission();
      setBrowserPermission(result);
      setRequestingPermission(false);
      if (result !== 'granted') {
        // User denied — don't enable the preference.
        return;
      }
    }
    setPreferences({ browserNotifications: on });
  }, [browserPermission, setPreferences]);

  return (
    <section aria-labelledby="notification-prefs-heading" className="space-y-1">
      <h3 id="notification-prefs-heading" className="text-sm font-semibold text-foreground">
        Notification preferences
      </h3>
      <p className="text-xs text-muted-foreground">
        Choose which events trigger in-app toasts and, optionally, OS-level alerts.
      </p>

      <div className="mt-4 divide-y divide-border rounded-lg border border-border px-4">
        {PREF_ROWS.map(({ key, label, description }) => (
          <ToggleRow
            key={key}
            id={`notif-pref-${key}`}
            label={label}
            description={description}
            checked={preferences[key]}
            onChange={(v) => setPreferences({ [key]: v })}
          />
        ))}

        {/* Browser notifications separator */}
        <div className="py-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Desktop alerts
          </p>
          <ToggleRow
            id="notif-pref-browser"
            label="Browser notifications"
            description={
              !supported
                ? 'Not supported in this browser.'
                : browserPermission === 'denied'
                  ? 'Permission was denied. Enable notifications in your browser settings.'
                  : 'Send OS-level alerts when InvoFi is in the background.'
            }
            checked={preferences.browserNotifications && browserPermission === 'granted'}
            disabled={!supported || browserPermission === 'denied' || requestingPermission}
            onChange={handleBrowserToggle}
          />
          {requestingPermission && (
            <p className="mt-1 text-xs text-muted-foreground animate-pulse">
              Waiting for permission…
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
