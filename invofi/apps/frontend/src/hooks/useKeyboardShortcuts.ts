"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Sequence-pressed key that hasn't timed out yet, or null.
 */
type PendingSequence = "g" | null;

const SHORTCUTS = [
  { keys: ["g", "m"], label: "g → m", description: "Go to Marketplace", href: "/marketplace" },
  { keys: ["g", "d"], label: "g → d", description: "Go to Dashboard", href: "/dashboard" },
  { keys: ["n"], label: "n", description: "New invoice", href: "/invoices/new" },
] as const;

const SEQUENCE_TIMEOUT_MS = 600;

/**
 * Returns true when the user is typing inside an input, textarea, or select.
 * Keyboard shortcuts are suppressed in that case.
 */
function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (
    document.activeElement instanceof HTMLElement &&
    document.activeElement.isContentEditable
  )
    return true;
  return false;
}

export function useKeyboardShortcuts() {
  const router = useRouter();
  const pendingRef = useRef<PendingSequence>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // ── Clear pending sequence ──────────────────────────────────────────────
  const clearPending = useCallback(() => {
    pendingRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Navigate helper ─────────────────────────────────────────────────────
  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      clearPending();
      setHelpOpen(false);
    },
    [router, clearPending],
  );

  // ── Close help on Escape ────────────────────────────────────────────────
  useEffect(() => {
    if (!helpOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setHelpOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpOpen]);

  // ── Main keydown handler ────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Always close help with Escape
      if (e.key === "Escape") {
        setHelpOpen(false);
        return;
      }

      // Show help with ?
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setHelpOpen((prev) => !prev);
        return;
      }

      // Don't fire shortcuts when typing
      if (isInputFocused()) return;

      const key = e.key.toLowerCase();

      // ── Single-key shortcuts ──────────────────────────────────────────
      if (key === "n") {
        e.preventDefault();
        navigate("/invoices/new");
        return;
      }

      // ── Sequence shortcuts ────────────────────────────────────────────
      if (key === "g") {
        e.preventDefault();
        pendingRef.current = "g";
        // Timeout: if the second key doesn't arrive within the window, clear
        timerRef.current = setTimeout(() => clearPending(), SEQUENCE_TIMEOUT_MS);
        return;
      }

      // If we have a pending "g" and the next key is m or d
      if (pendingRef.current === "g") {
        if (key === "m") {
          e.preventDefault();
          navigate("/marketplace");
          return;
        }
        if (key === "d") {
          e.preventDefault();
          navigate("/dashboard");
          return;
        }
        // Any other key cancels the sequence
        clearPending();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearPending();
    };
  }, [navigate, clearPending]);

  return { helpOpen, setHelpOpen, shortcuts: SHORTCUTS };
}