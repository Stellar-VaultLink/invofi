'use client';

// AlertConfigPanel — admin UI for managing threshold alert rules.
//
// Reads alert_configs from Supabase (via lib/health/metrics.ts), lets admins:
//   • Toggle existing rules on/off
//   • Edit threshold, operator, or severity
//   • Delete a rule
//   • Add a new rule via an inline form
//
// All writes are append-only inserts or full-row updates; the table RLS
// enforces that only `role = 'admin'` users can mutate rows.
// Each mutation is also appended to audit_log via insertAuditLog.

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, ToggleLeft, ToggleRight, Pencil, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  fetchAlertConfigs,
  createAlertConfig,
  updateAlertConfig,
  deleteAlertConfig,
  insertAuditLog,
} from '@/lib/health/metrics';
import type {
  AlertConfig,
  AlertConfigDraft,
  AlertMetric,
  AlertOperator,
  AlertSeverity,
} from '@/lib/health/types';
import { METRIC_LABELS, OPERATOR_LABELS } from '@/lib/health/types';
import { supabase } from '@/lib/supabase';

// ── constants ─────────────────────────────────────────────────────────────────

const METRICS: AlertMetric[] = [
  'overdue_rate',
  'repayment_rate',
  'tx_failure_rate',
  'insurance_pool_total',
  'avg_fee_stroops',
  'invoices_overdue',
];

const OPERATORS: AlertOperator[] = ['gt', 'lt', 'gte', 'lte'];
const SEVERITIES: AlertSeverity[] = ['info', 'warning', 'critical'];

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  info:     'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  warning:  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const EMPTY_DRAFT: AlertConfigDraft = {
  label:     '',
  metric:    'overdue_rate',
  operator:  'gt',
  threshold: '0.15',
  severity:  'warning',
  enabled:   true,
};

// ── helpers ───────────────────────────────────────────────────────────────────

async function actorEmail(): Promise<string | undefined> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email ?? undefined;
}

// ── component ─────────────────────────────────────────────────────────────────

export function AlertConfigPanel() {
  const [configs, setConfigs] = useState<AlertConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<AlertConfigDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<AlertConfigDraft>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAlertConfigs();
      setConfigs(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── add new rule ──────────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (!draft.label.trim()) return;
    setSaving(true);
    try {
      const created = await createAlertConfig(draft);
      setConfigs(prev => [...prev, created]);
      await insertAuditLog({
        action_type: 'config_change',
        message: `Alert rule created: "${draft.label}"`,
        details: { rule: draft },
        severity: 'info',
        actor_email: await actorEmail(),
      });
      setAdding(false);
      setDraft(EMPTY_DRAFT);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── toggle enabled ────────────────────────────────────────────────────────

  const handleToggle = async (cfg: AlertConfig) => {
    const updated = !cfg.enabled;
    try {
      await updateAlertConfig(cfg.id, { enabled: updated });
      setConfigs(prev => prev.map(c => c.id === cfg.id ? { ...c, enabled: updated } : c));
      await insertAuditLog({
        action_type: 'config_change',
        message: `Alert rule "${cfg.label}" ${updated ? 'enabled' : 'disabled'}`,
        details: { id: cfg.id, enabled: updated },
        severity: 'info',
        actor_email: await actorEmail(),
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // ── inline edit ───────────────────────────────────────────────────────────

  const handleEditSave = async (id: string) => {
    setSaving(true);
    try {
      await updateAlertConfig(id, editDraft);
      setConfigs(prev => prev.map(c => c.id === id ? { ...c, ...editDraft } : c));
      await insertAuditLog({
        action_type: 'config_change',
        message: `Alert rule updated`,
        details: { id, patch: editDraft },
        severity: 'info',
        actor_email: await actorEmail(),
      });
      setEditingId(null);
      setEditDraft({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ── delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (cfg: AlertConfig) => {
    if (!window.confirm(`Delete rule "${cfg.label}"?`)) return;
    try {
      await deleteAlertConfig(cfg.id);
      setConfigs(prev => prev.filter(c => c.id !== cfg.id));
      await insertAuditLog({
        action_type: 'config_change',
        message: `Alert rule deleted: "${cfg.label}"`,
        details: { id: cfg.id },
        severity: 'warning',
        actor_email: await actorEmail(),
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline text-xs">dismiss</button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : configs.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No alert rules configured. Add one below.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-3 font-medium">Label</th>
                <th className="pb-2 pr-3 font-medium">Metric</th>
                <th className="pb-2 pr-3 font-medium">Condition</th>
                <th className="pb-2 pr-3 font-medium">Severity</th>
                <th className="pb-2 pr-3 font-medium text-center">Enabled</th>
                <th className="pb-2 font-medium" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {configs.map(cfg => {
                const isEditing = editingId === cfg.id;
                return (
                  <tr key={cfg.id} className="group">
                    {/* Label */}
                    <td className="py-2 pr-3">
                      {isEditing ? (
                        <Input
                          value={editDraft.label ?? cfg.label}
                          onChange={e => setEditDraft(d => ({ ...d, label: e.target.value }))}
                          className="h-7 text-xs"
                          aria-label="Alert label"
                        />
                      ) : (
                        <span className={cfg.enabled ? '' : 'line-through text-muted-foreground'}>
                          {cfg.label}
                        </span>
                      )}
                    </td>

                    {/* Metric */}
                    <td className="py-2 pr-3">
                      {isEditing ? (
                        <select
                          value={editDraft.metric ?? cfg.metric}
                          onChange={e => setEditDraft(d => ({ ...d, metric: e.target.value as AlertMetric }))}
                          className="h-7 text-xs rounded border border-input bg-background px-2"
                          aria-label="Alert metric"
                        >
                          {METRICS.map(m => (
                            <option key={m} value={m}>{METRIC_LABELS[m]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {METRIC_LABELS[cfg.metric]}
                        </span>
                      )}
                    </td>

                    {/* Condition */}
                    <td className="py-2 pr-3">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <select
                            value={editDraft.operator ?? cfg.operator}
                            onChange={e => setEditDraft(d => ({ ...d, operator: e.target.value as AlertOperator }))}
                            className="h-7 text-xs rounded border border-input bg-background px-2"
                            aria-label="Operator"
                          >
                            {OPERATORS.map(op => (
                              <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                            ))}
                          </select>
                          <Input
                            value={editDraft.threshold ?? cfg.threshold}
                            onChange={e => setEditDraft(d => ({ ...d, threshold: e.target.value }))}
                            className="h-7 text-xs w-20"
                            aria-label="Threshold"
                          />
                        </div>
                      ) : (
                        <span className="font-mono text-xs">
                          {OPERATOR_LABELS[cfg.operator]} {cfg.threshold}
                        </span>
                      )}
                    </td>

                    {/* Severity */}
                    <td className="py-2 pr-3">
                      {isEditing ? (
                        <select
                          value={editDraft.severity ?? cfg.severity}
                          onChange={e => setEditDraft(d => ({ ...d, severity: e.target.value as AlertSeverity }))}
                          className="h-7 text-xs rounded border border-input bg-background px-2"
                          aria-label="Severity"
                        >
                          {SEVERITIES.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <Badge className={`text-xs ${SEVERITY_STYLES[cfg.severity]}`} variant="outline">
                          {cfg.severity}
                        </Badge>
                      )}
                    </td>

                    {/* Enabled toggle */}
                    <td className="py-2 pr-3 text-center">
                      <button
                        onClick={() => handleToggle(cfg)}
                        aria-label={cfg.enabled ? 'Disable rule' : 'Enable rule'}
                        aria-pressed={cfg.enabled}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {cfg.enabled
                          ? <ToggleRight className="h-5 w-5 text-green-500" />
                          : <ToggleLeft className="h-5 w-5" />
                        }
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-2">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleEditSave(cfg.id)}
                              disabled={saving}
                              aria-label="Save changes"
                              className="p-1 rounded hover:bg-accent text-green-600"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { setEditingId(null); setEditDraft({}); }}
                              aria-label="Cancel edit"
                              className="p-1 rounded hover:bg-accent"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => { setEditingId(cfg.id); setEditDraft({}); }}
                              aria-label={`Edit rule "${cfg.label}"`}
                              className="p-1 rounded hover:bg-accent text-muted-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(cfg)}
                              aria-label={`Delete rule "${cfg.label}"`}
                              className="p-1 rounded hover:bg-accent text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add form */}
      {adding ? (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <p className="text-sm font-medium">New alert rule</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="new-label" className="text-xs text-muted-foreground">Label</label>
              <Input
                id="new-label"
                placeholder='e.g. "Overdue rate too high"'
                value={draft.label}
                onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="new-metric" className="text-xs text-muted-foreground">Metric</label>
              <select
                id="new-metric"
                value={draft.metric}
                onChange={e => setDraft(d => ({ ...d, metric: e.target.value as AlertMetric }))}
                className="w-full h-8 text-sm rounded border border-input bg-background px-2"
              >
                {METRICS.map(m => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Condition</label>
              <div className="flex gap-2">
                <select
                  value={draft.operator}
                  onChange={e => setDraft(d => ({ ...d, operator: e.target.value as AlertOperator }))}
                  className="h-8 text-sm rounded border border-input bg-background px-2"
                  aria-label="Operator"
                >
                  {OPERATORS.map(op => <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>)}
                </select>
                <Input
                  value={draft.threshold}
                  onChange={e => setDraft(d => ({ ...d, threshold: e.target.value }))}
                  className="h-8 text-sm w-24"
                  placeholder="0.15"
                  aria-label="Threshold value"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="new-severity" className="text-xs text-muted-foreground">Severity</label>
              <select
                id="new-severity"
                value={draft.severity}
                onChange={e => setDraft(d => ({ ...d, severity: e.target.value as AlertSeverity }))}
                className="w-full h-8 text-sm rounded border border-input bg-background px-2"
              >
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving || !draft.label.trim()}>
              {saving ? 'Saving…' : 'Add rule'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setDraft(EMPTY_DRAFT); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAdding(true)}
          className="gap-1"
        >
          <Plus className="h-4 w-4" />
          Add alert rule
        </Button>
      )}
    </div>
  );
}
