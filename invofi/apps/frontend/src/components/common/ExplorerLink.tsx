"use client";

import type { ReactNode, MouseEventHandler } from "react";
import {
  explorerAccountUrl,
  explorerContractUrl,
  explorerTxUrl,
} from "@/lib/constants";

export type ExplorerLinkType = "contract" | "account" | "tx";

const URL_FOR: Record<ExplorerLinkType, (id: string) => string> = {
  contract: explorerContractUrl,
  account: explorerAccountUrl,
  tx: explorerTxUrl,
};

export interface ExplorerLinkProps {
  type: ExplorerLinkType;
  id: string;
  children: ReactNode;
  className?: string;
  title?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

/** Network-aware Stellar Expert link using shared helpers from `@/lib/constants`. */
export function ExplorerLink({
  type,
  id,
  children,
  className,
  title,
  onClick,
}: ExplorerLinkProps) {
  return (
    <a
      href={URL_FOR[type](id)}
      target="_blank"
      rel="noreferrer noopener"
      className={className}
      title={title}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
