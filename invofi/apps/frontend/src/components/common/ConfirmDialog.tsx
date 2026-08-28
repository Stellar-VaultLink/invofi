'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { HoldToConfirmButton } from './HoldToConfirmButton';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  loading?: boolean;
  /** When true, the confirm button requires pressing and holding ~1.5s to trigger onConfirm */
  holdToConfirm?: boolean;
  /** Duration in ms that the button must be held (default: 1500) */
  holdDuration?: number;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  onConfirm,
  loading = false,
  holdToConfirm = false,
  holdDuration,
}: ConfirmDialogProps) {
  const t = useTranslations('Common');
  const confirmText = confirmLabel ?? t('confirm');
  const cancelText = cancelLabel ?? t('cancel');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelText}
          </Button>

          {holdToConfirm && !loading ? (
            <HoldToConfirmButton
              label={confirmText}
              variant={variant}
              holdDuration={holdDuration}
              onConfirm={onConfirm}
            />
          ) : (
            <Button
              variant={variant === 'destructive' ? 'destructive' : 'default'}
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? t('submitting') : confirmText}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
