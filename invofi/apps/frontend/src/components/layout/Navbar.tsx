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
} from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { WalletButton } from "@/components/auth/WalletButton";
import { useWallet } from "@/components/auth/WalletProvider";
import { supabase } from "@/lib/supabase";
import { NavbarEventIndicator } from "@/components/NavbarEventIndicator";

import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

const NETWORK = (
  process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet"
).toLowerCase();
const IS_MAINNET = NETWORK === "mainnet" || NETWORK === "public";

export function Navbar() {
  const t = useTranslations('Navbar');
  const pathname = usePathname();
  const router = useRouter();
  const { networkMismatch } = useWallet();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  const NAV_LINKS = [
    { href: "/dashboard", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/marketplace", label: t("marketplace"), icon: Store },
    { href: "/portfolio", label: t("portfolio"), icon: Briefcase },
    { href: "/transactions", label: t("approvals"), icon: ShieldCheck },
  ];

  const [mounted, setMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

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

            <button
              onClick={toggleTheme}
              className="p-2 rounded-md text-muted-foreground hover:bg-accent transition-colors"
              title={t("toggleTheme")}
              aria-label={t("toggleTheme")}
            >
              {isDark ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
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
              onClick={() => setDrawerOpen((v) => !v)}
              className="md:hidden p-2 rounded-md text-muted-foreground hover:bg-accent transition-colors"
              aria-label={drawerOpen ? "Close menu" : "Open menu"}
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
        className={cn(
          "fixed top-16 right-0 bottom-0 z-40 w-72 bg-background border-l border-border shadow-xl flex flex-col transition-transform duration-200 md:hidden",
          drawerOpen ? "translate-x-0" : "translate-x-full",
        )}
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
