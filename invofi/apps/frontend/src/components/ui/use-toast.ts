'use client';

import * as React from 'react';
import type { ToastActionElement, ToastProps } from './toast';

const TOAST_LIMIT = 3;
// Per-variant dismiss durations (ms):
//  - destructive/error: 8s (longer so users can read error details)
//  - default: 3s (quick confirmation, no need to linger)
//  - fallback: 5s (original default)
const TOAST_DURATION = {
  destructive: 8000,
  default: 3000,
} as const;
const TOAST_REMOVE_DELAY_DEFAULT = 5000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

type Action =
  | { type: 'ADD_TOAST'; toast: ToasterToast }
  | { type: 'UPDATE_TOAST'; toast: Partial<ToasterToast> & Pick<ToasterToast, 'id'> }
  | { type: 'DISMISS_TOAST'; toastId?: string }
  | { type: 'REMOVE_TOAST'; toastId?: string };

interface State { toasts: ToasterToast[] }

let count = 0;
function genId() { return (++count).toString(); }

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function addToRemoveQueue(toastId: string, variant: string | undefined, dispatch: React.Dispatch<Action>) {
  if (toastTimeouts.has(toastId)) return;
  const duration =
    variant === 'destructive' ? TOAST_DURATION.destructive
    : variant === 'default' ? TOAST_DURATION.default
    : TOAST_REMOVE_DELAY_DEFAULT;
  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({ type: 'REMOVE_TOAST', toastId });
  }, duration);
  toastTimeouts.set(toastId, timeout);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_TOAST': {
      const next = [action.toast, ...state.toasts];
      // Cap concurrent visible toasts: when the stack would exceed the
      // limit, keep the new toast, dismiss the oldest (open:false so the
      // exit animation plays) and schedule removal instead of dropping it
      // instantly — otherwise the viewport overflows on mobile.
      if (next.length > TOAST_LIMIT) {
        const oldest = next[next.length - 1];
        addToRemoveQueue(oldest.id, oldest.variant, dispatch);
        return {
          ...state,
          toasts: [action.toast, ...state.toasts.slice(0, TOAST_LIMIT - 1), { ...oldest, open: false }],
        };
      }
      return { ...state, toasts: next };
    }
    case 'UPDATE_TOAST':
      return { ...state, toasts: state.toasts.map(t => t.id === action.toast.id ? { ...t, ...action.toast } : t) };
    case 'DISMISS_TOAST': {
      const { toastId } = action;
      if (toastId) {
        const toast = state.toasts.find(t => t.id === toastId);
        addToRemoveQueue(toastId, toast?.variant, dispatch);
      } else {
        state.toasts.forEach(t => addToRemoveQueue(t.id, t.variant, dispatch));
      }
      return { ...state, toasts: state.toasts.map(t => (!toastId || t.id === toastId) ? { ...t, open: false } : t) };
    }
    case 'REMOVE_TOAST':
      return { ...state, toasts: action.toastId ? state.toasts.filter(t => t.id !== action.toastId) : [] };
  }
}

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach(l => l(memoryState));
}

type Toast = Omit<ToasterToast, 'id'>;

function toast({ ...props }: Toast) {
  const id = genId();
  const update = (p: Partial<ToasterToast>) => dispatch({ type: 'UPDATE_TOAST', toast: { ...p, id } });
  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id });
  dispatch({ type: 'ADD_TOAST', toast: { ...props, id, open: true, onOpenChange: open => { if (!open) dismiss(); } } });
  return { id, dismiss, update };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);
  React.useEffect(() => {
    listeners.push(setState);
    return () => { const idx = listeners.indexOf(setState); if (idx > -1) listeners.splice(idx, 1); };
  }, []);
  return { ...state, toast, dismiss: (id?: string) => dispatch({ type: 'DISMISS_TOAST', toastId: id }) };
}

export { useToast, toast };
