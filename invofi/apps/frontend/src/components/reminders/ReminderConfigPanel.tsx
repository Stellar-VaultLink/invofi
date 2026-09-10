'use client';

// ReminderConfigPanel — admin UI for the singleton `reminder_configs` row
// (issue #224). Lets an admin:
//   • Turn the whole reminder run on/off
//   • Pick which of the five stages are active
//   • Set (or clear) the default webhook URL + signing secret
//   • Tune the webhook retry attempt count
//
// Writes go straight to Supabase; RLS enforces `role = 'admin'` on the
// `reminder_configs` table, so this panel is defense-in-depth, not the only
// gate (AdminGuard wraps the page too).

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ToggleLeft, ToggleRight, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { fetchReminderConfig, updateReminderConfig } from '@/lib/reminders/history';
import { REMINDER_STAGES, STAGE_LABELS } from '@/lib/reminders/types';
import type { ReminderConfig, ReminderStage } from '@/lib/reminders/types';

export function ReminderConfigPanel() {
  const [config, setConfig] = useState<ReminderConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Draft fields, separate from `config` so edits don't hit the network on
  // every keystroke.
  const [enabled, setEnabled] = useState(true);
  const [stages, setStages] = useState<Set<ReminderStage>>(new Set(REMINDER_STAGES));
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [maxAttempts, setMaxAttempts] = useState(3);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReminderConfig();
      if (data) {
        setConfig(data);
        setEnabled(data.enabled);
        setStages(new Set(data.stages));
        setWebhookUrl(data.webhook_url ?? '');
        setWebhookSecret(data.webhook_secret ?? '');
        setMaxAttempts(data.max_webhook_attempts);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStage = (stage: ReminderStage) => {
    setStages(prev => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await updateReminderConfig(
        {
          enabled,
          stages: REMINDER_STAGES.filter(s => stages.has(s)),
          webhook_url: webhookUrl.trim() || null,
          webhook_secret: webhookSecret.trim() || null,
          max_webhook_attempts: maxAttempts,
        },
        user?.id ?? '',
      );
      setSavedAt(Date.now());
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-500" />
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-red-500">
          reminder_configs row not found — run migration 005 in Supabase.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Reminder settings</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setEnabled(e => !e)}
          aria-pressed={enabled}
        >
          {enabled ? (
            <ToggleRight className="h-5 w-5 text-green-500" />
          ) : (
            <ToggleLeft className="h-5 w-5 text-muted-foreground" />
          )}
          {enabled ? 'Reminders enabled' : 'Reminders disabled'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label className="mb-2 block text-sm font-medium">Active stages</Label>
          <div className="flex flex-wrap gap-3">
            {REMINDER_STAGES.map(stage => (
              <label key={stage} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={stages.has(stage)}
                  onChange={() => toggleStage(stage)}
                  className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-800"
                />
                {STAGE_LABELS[stage]}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="webhook-url" className="mb-1 block text-sm font-medium">
              Webhook URL
            </Label>
            <Input
              id="webhook-url"
              placeholder="https://example.com/hooks/invofi-reminders"
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Leave blank to disable webhook delivery — email still sends.
            </p>
          </div>
          <div>
            <Label htmlFor="webhook-secret" className="mb-1 block text-sm font-medium">
              Webhook signing secret
            </Label>
            <Input
              id="webhook-secret"
              type="password"
              placeholder="Used to sign the X-Invofi-Signature header"
              value={webhookSecret}
              onChange={e => setWebhookSecret(e.target.value)}
            />
          </div>
        </div>

        <div className="max-w-[200px]">
          <Label htmlFor="max-attempts" className="mb-1 block text-sm font-medium">
            Max webhook retry attempts
          </Label>
          <Input
            id="max-attempts"
            type="number"
            min={1}
            max={10}
            value={maxAttempts}
            onChange={e => setMaxAttempts(Number(e.target.value))}
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save settings
          </Button>
          {savedAt && !saving && (
            <span className="text-xs text-muted-foreground">Saved.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
