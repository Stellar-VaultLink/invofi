'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getInvoice } from '@/lib/contract';
import { formatAmount, formatDate, interestRateLabel, durationLabel } from '@/lib/utils';
import { toStroopsBigInt } from '@/lib/utils';
import {
  REGISTRY_CONTRACT_ID,
  FINANCING_CONTRACT_ID,
  REPAYMENT_CONTRACT_ID,
  STELLAR_NETWORK,
  explorerContractUrl,
} from '@/lib/constants';
import type { Invoice, FinancingOffer } from '@/types';

/** Total repayment due in stroops: principal + simple yield */
function totalDue(offer: FinancingOffer): bigint {
  const amt = toStroopsBigInt(offer.amount);
  return amt + (amt * BigInt(offer.interest_rate)) / 10_000n;
}

export default function InvoicePrintView() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [offers, setOffers] = useState<FinancingOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Initialized empty so server (if any) and client first pass agree; set in useEffect.
  const [printedAt, setPrintedAt] = useState('');

 useEffect(() => {
  if (!id) return;

  (async () => {
    try {
      const [inv, offersRes] = await Promise.all([
        getInvoice(id).catch(() => null),
        supabase
          .from('financing_offers')
          .select('*')
          .eq('invoice_id', id)
          .order('created_at', { ascending: false }),
      ]);

      if (!inv) { setError('Invoice not found.'); return; }
      setInvoice(inv);

      const ofs = ((offersRes.data as unknown as FinancingOffer[]) ?? []).map(o => ({
        ...o,
        amount: toStroopsBigInt(o.amount),
        amount_repaid: toStroopsBigInt(o.amount_repaid),
      }));
      setOffers(ofs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  })();
}, [id]);

  // Client-only: set the printed timestamp after mount
  useEffect(() => {
    setPrintedAt(
      new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })
    );
  }, []);

  // Auto-open print dialog once data is ready
  useEffect(() => {
    if (!loading && !error && invoice) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [loading, error, invoice]);

  return (
    <>
      {/* ── Print / screen styles ─────────────────────────────────────────── */}
      {/*
        Note: no @import of Google Fonts here — Inter is already self-hosted
        by next/font (root layout) and served from this origin, so the print
        view keeps a strict, third-party-free CSP (issue #186).
      */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        body {
          font-family: 'Inter', system-ui, sans-serif;
          background: #fff;
          color: #111;
          margin: 0;
          padding: 0;
        }

        .print-wrap {
          max-width: 760px;
          margin: 0 auto;
          padding: 48px 40px;
        }

        /* ── brand header ── */
        .brand-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2px solid #111;
          padding-bottom: 20px;
          margin-bottom: 32px;
        }
        .brand-name {
          font-size: 26px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }
        .brand-name span { color: #4f46e5; }
        .doc-title {
          font-size: 13px;
          color: #666;
          text-align: right;
        }

        /* ── status badge ── */
        .status-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          padding: 3px 10px;
          border-radius: 20px;
          border: 1px solid transparent;
        }

        /* ── section heading ── */
        h2 {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: #666;
          margin: 32px 0 12px;
          padding-bottom: 6px;
          border-bottom: 1px solid #e5e7eb;
        }

        /* ── metadata grid ── */
        .meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px 32px;
        }
        .meta-field label {
          display: block;
          font-size: 10px;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 3px;
        }
        .meta-field p {
          margin: 0;
          font-size: 14px;
          font-weight: 500;
          word-break: break-all;
        }
        .mono { font-family: 'Courier New', monospace; font-size: 13px; }

        /* ── offers table ── */
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        thead tr { background: #f9fafb; }
        th {
          text-align: left;
          padding: 8px 10px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #555;
          border-bottom: 1px solid #e5e7eb;
        }
        td {
          padding: 9px 10px;
          border-bottom: 1px solid #f3f4f6;
          vertical-align: top;
        }
        tr:last-child td { border-bottom: none; }

        /* ── footer ── */
        .print-footer {
          margin-top: 48px;
          padding-top: 16px;
          border-top: 1px solid #e5e7eb;
          font-size: 11px;
          color: #999;
          display: flex;
          justify-content: space-between;
          gap: 16px;
        }
        .print-footer a { color: #999; text-decoration: none; }

        /* ── screen-only controls ── */
        .screen-controls {
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
          padding: 12px 40px;
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 16px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid transparent;
          text-decoration: none;
          font-family: inherit;
        }
        .btn-primary { background: #4f46e5; color: #fff; border-color: #4f46e5; }
        .btn-ghost { background: transparent; color: #555; border-color: #d1d5db; }
        .btn:hover { opacity: 0.88; }

        @media print {
          .screen-controls { display: none !important; }
          .print-wrap { padding: 0; max-width: 100%; }
          body { font-size: 12px; }
        }

        @page {
          margin: 18mm 16mm;
          size: A4;
        }
      `}</style>

      {/* ── Screen-only toolbar (hidden when printing) ───────────────────── */}
      <div className="screen-controls">
        <button className="btn btn-primary" onClick={() => window.print()}>
          🖨&nbsp; Print / Save as PDF
        </button>
        <a className="btn btn-ghost" href={`/invoices/${id}`}>
          ← Back to invoice
        </a>
      </div>

      {/* ── Document body ─────────────────────────────────────────────────── */}
      <div className="print-wrap">
        {loading && (
          <p style={{ color: '#888', padding: '60px 0', textAlign: 'center' }}>
            Loading invoice…
          </p>
        )}
        {error && (
          <p style={{ color: '#dc2626', padding: '60px 0', textAlign: 'center' }}>
            {error}
          </p>
        )}

        {invoice && (
          <>
            {/* ── Brand header ── */}
            <div className="brand-header">
              <div>
                <div className="brand-name">Invo<span>Fi</span></div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
                  Stellar Invoice Finance · {STELLAR_NETWORK}
                </div>
              </div>
              <div className="doc-title">
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>INVOICE</div>
                <span
                  className="status-badge"
                  style={{
                    background:
                      invoice.status === 'Repaid' ? '#dcfce7' :
                        invoice.status === 'Financed' ? '#dbeafe' :
                          invoice.status === 'Pending' ? '#fef9c3' :
                            invoice.status === 'Overdue' ? '#fee2e2' :
                              '#f3f4f6',
                    color:
                      invoice.status === 'Repaid' ? '#166534' :
                        invoice.status === 'Financed' ? '#1e40af' :
                          invoice.status === 'Pending' ? '#854d0e' :
                            invoice.status === 'Overdue' ? '#991b1b' :
                              '#374151',
                  }}
                >
                  {invoice.status}
                </span>
                {printedAt && (
                  <div style={{ marginTop: 8, color: '#aaa', fontSize: 11 }}>
                    Printed {printedAt}
                  </div>
                )}
              </div>
            </div>

            {/* ── Invoice metadata ── */}
            <h2>Invoice Details</h2>
            <div className="meta-grid">
              <div className="meta-field">
                <label>Invoice ID</label>
                <p className="mono">{invoice.id}</p>
              </div>
              <div className="meta-field">
                <label>Amount</label>
                <p className="mono">
                  {formatAmount(invoice.amount)} {invoice.currency}
                </p>
              </div>
              <div className="meta-field">
                <label>Currency</label>
                <p>{invoice.currency}</p>
              </div>
              <div className="meta-field">
                <label>Due Date</label>
                <p>{formatDate(invoice.due_date)}</p>
              </div>
              <div className="meta-field" style={{ gridColumn: '1 / -1' }}>
                <label>Originator (Stellar Address)</label>
                <p className="mono">{invoice.originator}</p>
              </div>
            </div>

            {/* ── Contract references ── */}
            {(REGISTRY_CONTRACT_ID || FINANCING_CONTRACT_ID || REPAYMENT_CONTRACT_ID) && (
              <>
                <h2>Smart Contract References</h2>
                <div className="meta-grid">
                  {REGISTRY_CONTRACT_ID && (
                    <div className="meta-field" style={{ gridColumn: '1 / -1' }}>
                      <label>Registry Contract</label>
                      <p className="mono">{REGISTRY_CONTRACT_ID}</p>
                    </div>
                  )}
                  {FINANCING_CONTRACT_ID && FINANCING_CONTRACT_ID !== REGISTRY_CONTRACT_ID && (
                    <div className="meta-field" style={{ gridColumn: '1 / -1' }}>
                      <label>Financing Contract</label>
                      <p className="mono">{FINANCING_CONTRACT_ID}</p>
                    </div>
                  )}
                  {REPAYMENT_CONTRACT_ID && REPAYMENT_CONTRACT_ID !== REGISTRY_CONTRACT_ID && (
                    <div className="meta-field" style={{ gridColumn: '1 / -1' }}>
                      <label>Repayment Contract</label>
                      <p className="mono">{REPAYMENT_CONTRACT_ID}</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Offer & repayment history ── */}
            <h2>Financing Offers &amp; Repayment History</h2>
            {offers.length === 0 ? (
              <p style={{ color: '#aaa', fontSize: 13, fontStyle: 'italic' }}>
                No financing offers recorded.
              </p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Lender</th>
                    <th>Amount</th>
                    <th>Rate</th>
                    <th>Term</th>
                    <th>Total Due</th>
                    <th>Repaid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map(offer => {
                    const repaid = toStroopsBigInt(offer.amount_repaid);
                    const due = totalDue(offer);
                    const remaining = due - repaid;
                    return (
                      <tr key={offer.id}>
                        <td className="mono" style={{ fontSize: 11 }}>
                          {offer.lender.slice(0, 6)}…{offer.lender.slice(-6)}
                        </td>
                        <td className="mono">
                          {formatAmount(offer.amount)} {offer.currency}
                        </td>
                        <td>{interestRateLabel(offer.interest_rate)}</td>
                        <td>{durationLabel(offer.duration)}</td>
                        <td className="mono">{formatAmount(due)} {offer.currency}</td>
                        <td className="mono">
                          {repaid > 0n ? (
                            <>
                              <span style={{ color: '#16a34a' }}>
                                {formatAmount(repaid)} {offer.currency}
                              </span>
                              {remaining > 0n && (
                                <span style={{ color: '#9ca3af', fontSize: 10 }}>
                                  {' '}/ {formatAmount(remaining)} {offer.currency} rem.
                                </span>
                              )}
                            </>
                          ) : (
                            <span style={{ color: '#d1d5db' }}>—</span>
                          )}
                        </td>
                        <td>
                          <span
                            className="status-badge"
                            style={{
                              fontSize: 10,
                              background:
                                offer.status === 'Repaid' ? '#dcfce7' :
                                  offer.status === 'Financed' || offer.status === 'Accepted' ? '#dbeafe' :
                                    offer.status === 'Pending' ? '#fef9c3' :
                                      offer.status === 'Defaulted' ? '#ffedd5' :
                                        '#f3f4f6',
                              color:
                                offer.status === 'Repaid' ? '#166534' :
                                  offer.status === 'Financed' || offer.status === 'Accepted' ? '#1e40af' :
                                    offer.status === 'Pending' ? '#854d0e' :
                                      offer.status === 'Defaulted' ? '#9a3412' :
                                        '#374151',
                            }}
                          >
                            {offer.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* ── Footer ── */}
            <div className="print-footer">
              <div>
                <div>Invoice ID: <span style={{ fontFamily: 'monospace' }}>{invoice.id}</span></div>
                {REGISTRY_CONTRACT_ID && (
                  <div style={{ marginTop: 3 }}>
                    Contract:{' '}
                    <a href={explorerContractUrl(REGISTRY_CONTRACT_ID)}>
                      {REGISTRY_CONTRACT_ID.slice(0, 8)}…{REGISTRY_CONTRACT_ID.slice(-8)}
                    </a>
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div>InvoFi · Stellar Invoice Finance Protocol</div>
                {printedAt && <div style={{ marginTop: 3 }}>{printedAt}</div>}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
