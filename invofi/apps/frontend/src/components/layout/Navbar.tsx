"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  Briefcase,
  ShieldCheck,
  Settings,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  Keyboard,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { WalletButton } from "@/components/auth/WalletButton";
import { useWallet } from "@/components/auth/WalletProvider";
import { supabase } from "@/lib/supabase";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { NavbarEventIndicator } from "@/components/NavbarEventIndicator";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

import { useTranslations } from 'next-intl';

const NETWORK = (
  process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet"
).toLowerCase();
const IS_MAINNET = NETWORK === "mainnet" || NETWORK === "public";

export function Navbar() {
  const t = useTranslations('Navbar');
  const pathname = usePathname();
  const router = useRouter();
  const { networkMismatch } = useWallet();
  const { helpOpen, setHelpOpen, shortcuts } = useKeyboardShortcuts();

  const NAV_LINKS = [
    { href: "/dashboard", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/marketplace", label: t("marketplace"), icon: Store },
    { href: "/portfolio", label: t("portfolio"), icon: Briefcase },
    { href: "/transactions", label: t("approvals"), icon: ShieldCheck },
  ];

  const [mounted, setMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const drawerToggleRef = useRef<HTMLButtonElement | null>(null);
  const shortcutsRef = useRef<HTMLDivElement | null>(null);

  const [theme, setTheme] = useLocalStorage<"light" | "dark">("theme", "light");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme, mounted]);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Focus management for the mobile drawer (WCAG 2.1 AA): trap focus while
  // open, return focus to the toggle on close.
  useEffect(() => {
    if (!drawerOpen) {
      if (drawerToggleRef.current) drawerToggleRef.current.focus();
      return;
    }

    const previousFocus = document.activeElement as HTMLElement | null;
    const drawer = drawerRef.current;
    // Move focus into the drawer on open.
    if (drawer) {
      const firstFocusable = drawer.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (firstFocusable ?? drawer).focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape closes the drawer
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        return;
      }
      // Trap Tab within the drawer
      if (e.key !== 'Tab' || !drawer) return;
      const focusables = drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [drawerOpen]);

  // Escape closes the keyboard-shortcuts help popover.
  useEffect(() => {
    if (!helpOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHelpOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [helpOpen, setHelpOpen]);

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (!mounted) return null;

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo + network badge */}
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <span className="text-blue-600">Invo</span>
            <span className="text-foreground">Fi</span>
            <span
              className={cn(
                "hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide",
                networkMismatch
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                  : IS_MAINNET
                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
              )}
            >
              {networkMismatch ? t("wrongNetwork") : NETWORK}
            </span>
          </Link>

          {/* Desktop nav */}
          <nav
            aria-label="Main navigation"
            className="hidden md:flex items-center gap-1"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm transition-colors",
                  pathname.startsWith(link.href)
                    ? "bg-blue-50 text-blue-700 dark:bg-gray-800 dark:text-blue-400 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <NavbarEventIndicator />

            {/* Keyboard shortcuts help */}
            <div className="relative">
              <button
                onClick={() => setHelpOpen(!helpOpen)}
                className="p-2 rounded-md text-muted-foreground hover:bg-accent transition-colors"
                title="Keyboard shortcuts (?)"
                aria-label="Toggle keyboard shortcuts help"
                aria-expanded={helpOpen}
              >
                <Keyboard className="h-5 w-5" />
              </button>
              {helpOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    aria-hidden
                    onClick={() => setHelpOpen(false)}
                  />
                  <div
                    ref={shortcutsRef}
                    role="dialog"
                    aria-label="Keyboard shortcuts"
                    className="absolute right-0 top-full mt-2 z-50 w-60 rounded-lg border border-border bg-background shadow-lg p-3 space-y-2"
                  >
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Keyboard shortcuts
                    </p>
                    <div className="space-y-1.5">
                      {shortcuts.map((s) => (
                        <div
                          key={s.label}
                          className="flex items-center justify-between text-sm"
                        >
                          <kbd className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
                            {s.label}
                          </kbd>
                          <span className="text-muted-foreground">
                            {s.description}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground pt-1 border-t border-border">
                      Press <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-mono">?</kbd> to toggle
                    </p>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={toggleTheme}
              className="p-2 rounded-md text-muted-foreground hover:bg-accent transition-colors"
              title={t("toggleTheme")}
              aria-label={t("toggleTheme")}
            >
              {theme === "light" ? (
                <Moon className="h-5 w-5" />
              ) : (
                <Sun className="h-5 w-5" />
              )}
            </button>

            <WalletButton />

            {!IS_MAINNET && (
              <Link
                href="https://github.com/Stellar-VaultLink/invofi-contracts"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors shrink-0"
                title={t("viewContracts")}
              >
                {t("testnet")}
              </Link>
            )}

            <Link
              href="/settings"
              className={cn(
                "hidden md:flex items-center text-muted-foreground hover:text-foreground transition-colors",
                pathname.startsWith("/settings") &&
                  "text-blue-700 dark:text-blue-400",
              )}
              title={t("settings")}
              aria-label={t("settings")}
            >
              <Settings className="h-4 w-4" />
            </Link>

            <button
              onClick={handleSignOut}
              className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              title={t("signOut")}
              aria-label={t("signOut")}
            >
              <LogOut className="h-4 w-4" />
            </button>

            {/* Mobile hamburger */}
            <button
              ref={drawerToggleRef}
              onClick={() => setDrawerOpen((v) => !v)}
              className="md:hidden p-2 rounded-md text-muted-foreground hover:bg-accent transition-colors"
              aria-label={drawerOpen ? "Close menu" : "Open menu"}
              aria-expanded={drawerOpen}
            >
              {drawerOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          aria-hidden
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        ref={drawerRef}
        className={cn(
          "fixed top-16 right-0 bottom-0 z-40 w-72 bg-background border-l border-border shadow-xl flex flex-col transition-transform duration-200 md:hidden",
          drawerOpen ? "translate-x-0" : "translate-x-full",
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        <nav className="flex-1 p-4 space-y-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                pathname.startsWith(link.href)
                  ? "bg-blue-50 text-blue-700 dark:bg-gray-800 dark:text-blue-400 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              <link.icon className="h-4 w-4 shrink-0" />
              {link.label}
            </Link>
          ))}
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
              pathname.startsWith("/settings")
                ? "bg-blue-50 text-blue-700 dark:bg-gray-800 dark:text-blue-400 font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            <Settings className="h-4 w-4 shrink-0" />
            {t("settings")}
          </Link>
        </nav>

        <div className="p-4 border-t border-border">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {t("signOut")}
          </button>
        </div>
      </div>
    </>
  );
}

