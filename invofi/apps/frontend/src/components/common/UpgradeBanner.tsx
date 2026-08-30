'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowUpCircle, ChevronDown, ChevronUp, X, ShieldAlert, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface UpgradeNotification {
  /** Contract address or name. */
  contractId: string;
  /** Current on-chain version. */
  currentVersion: string;
  /** Recommended version to upgrade to. */
  targetVersion: string;
  /** Severity level. */
  severity: 'info' | 'warning' | 'critical';
  /** Human-readable message. */
  message: string;
  /** Whether this is a breaking (major) upgrade. */
  isBreaking: boolean;
}

interface UpgradeBannerProps {
  /** List of upgrade notifications to display. */
  notifications: UpgradeNotification[];
  /** Callback when the user dismisses a notification. */
  onDismiss?: (contractId: string) => void;
  /** Callback when the user clicks "Upgrade". */
  onUpgrade?: (contractId: string, targetVersion: string) => void;
  /** Additional CSS class. */
  className?: string;
}

const SEVERITY_CONFIG = {
  info: {
    icon: Info,
    containerClass: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-200',
    iconClass: 'text-blue-500 dark:text-blue-400',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300',
  },
  warning: {
    icon: AlertTriangle,
    containerClass: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200',
    iconClass: 'text-amber-500 dark:text-amber-400',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
  },
  critical: {
    icon: ShieldAlert,
    containerClass: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200',
    iconClass: 'text-red-500 dark:text-red-400',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300',
  },
} as const;

function SingleNotification({
  notification,
  onDismiss,
  onUpgrade,
}: {
  notification: UpgradeNotification;
  onDismiss?: (contractId: string) => void;
  onUpgrade?: (contractId: string, targetVersion: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = SEVERITY_CONFIG[notification.severity];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border p-4 shadow-sm',
        config.containerClass,
      )}
      role="alert"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', config.iconClass)} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Contract Update Available</span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  config.badgeClass,
                )}
              >
                {notification.isBreaking ? 'Breaking' : 'Update'}
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed">{notification.message}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onUpgrade && (
            <button
              onClick={() => onUpgrade(notification.contractId, notification.targetVersion)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium',
                'transition-colors hover:opacity-90',
                notification.severity === 'critical'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : notification.severity === 'warning'
                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700',
              )}
            >
              <ArrowUpCircle className="h-4 w-4" />
              Upgrade
            </button>
          )}
          {onDismiss && (
            <button
              onClick={() => onDismiss(notification.contractId)}
              className="rounded-md p-1.5 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expandable version details */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-2 flex items-center gap-1 text-xs opacity-70 hover:opacity-100 transition-opacity self-start"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      {expanded && (
        <div className="mt-2 rounded-md bg-white/50 dark:bg-black/20 p-3 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="font-medium">Contract:</span>
            <span className="font-mono">{notification.contractId.slice(0, 12)}…</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Current version:</span>
            <span className="font-mono">{notification.currentVersion}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">Target version:</span>
            <span className="font-mono">{notification.targetVersion}</span>
          </div>
          {notification.isBreaking && (
            <p className="text-red-600 font-medium pt-1 dark:text-red-400">
              ⚠️ This is a major upgrade — a migration plan should be prepared before upgrading.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * UpgradeBanner displays upgrade notifications for Soroban contracts.
 * Shows severity-appropriate styling and provides upgrade/dismiss actions.
 *
 * Usage:
 *   <UpgradeBanner
 *     notifications={upgradeNotifications}
 *     onUpgrade={(id, ver) => openUpgradeWizard(id, ver)}
 *     onDismiss={(id) => dismissNotification(id)}
 *   />
 */
export function UpgradeBanner({
  notifications,
  onDismiss,
  onUpgrade,
  className,
}: UpgradeBannerProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = notifications.filter(n => !dismissed.has(n.contractId));

  if (visible.length === 0) return null;

  const handleDismiss = (contractId: string) => {
    setDismissed(prev => new Set([...prev, contractId]));
    onDismiss?.(contractId);
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {visible.map(notification => (
        <SingleNotification
          key={notification.contractId}
          notification={notification}
          onDismiss={handleDismiss}
          onUpgrade={onUpgrade}
        />
      ))}
    </div>
  );
}
