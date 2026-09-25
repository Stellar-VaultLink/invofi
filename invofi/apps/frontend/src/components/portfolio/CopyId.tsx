"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check } from "lucide-react";

export function CopyId({ id }: { id: string }) {
  const t = useTranslations('Common');
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <button
      onClick={copy}
      title={copied ? t('copied') : t('copy')}
      className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground group"
    >
      {/* Contract IDs are base32 identifiers — force LTR so they are not
          visually reversed inside an RTL layout. */}
      <span className="truncate max-w-[140px]" dir="ltr">{id}</span>
      {copied
        ? <Check className="h-3 w-3 text-green-500 shrink-0" />
        : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-60 shrink-0 transition-opacity" />
      }
    </button>
  );
}
