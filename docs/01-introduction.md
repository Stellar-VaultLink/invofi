# Introduction

## The Problem

Small and medium-sized businesses (SMBs) are the backbone of global trade, but they are chronically starved of working capital. The typical invoice payment cycle is 30–90 days. A business delivers goods or services today but waits months to be paid. During that wait:

- They can't pay suppliers on time
- They can't take on new orders they don't have cash to fulfil
- They turn to expensive bank loans or invoice factoring companies that charge 3–8% fees and take weeks to process

Traditional invoice financing (factoring) exists to solve this — but it is slow, expensive, opaque, and only accessible to businesses with established banking relationships.

---

## The Solution

**InvoFi** is an open-source, decentralized invoice financing protocol built on **Stellar Soroban**. It removes the bank from the equation and replaces it with a smart contract.

Here is how it works:

1. **A business registers an invoice on-chain.** The invoice (amount, currency, due date) is stored in the InvoFi Soroban contract and becomes a verifiable on-chain asset.

2. **Investors (lenders) browse the marketplace** and submit financing offers. Each offer specifies how much they will advance, at what interest rate, and for how long.

3. **The business accepts the best offer.** The contract records the acceptance and marks the invoice as Financed.

4. **At the due date, the business repays.** The contract marks the invoice as Repaid and the lender's offer as Repaid.

Everything is visible on the Stellar blockchain. No paperwork. No credit checks. No 3-week approval process.

---

## Why Stellar Soroban?

Stellar was chosen for InvoFi for three reasons:

1. **Speed and cost.** Stellar transactions confirm in ~5 seconds and cost fractions of a cent. Invoice financing is a high-frequency, low-margin business — gas fees on Ethereum would be prohibitive.

2. **Soroban smart contracts.** Stellar's native WebAssembly contract platform (Soroban) is purpose-built for financial applications, with strong type safety and predictable resource costs.

3. **Asset infrastructure.** Stellar has native support for custom assets (like USDC) without needing a separate token contract. InvoFi supports both XLM and USDC invoices.

---

## Who is InvoFi for?

### Businesses (Originators)

Any business that issues invoices to customers can use InvoFi. The typical user is a small business owner who has a large invoice outstanding and needs cash now, not in 60 days.

**To use InvoFi as a business:**
- Create an account (email or Freighter wallet)
- Register your invoice on-chain (amount, currency, due date)
- Wait for financing offers from lenders
- Accept the best offer
- Repay when the due date arrives

### Lenders (Investors)

Lenders are investors who want to earn yield by financing real-world invoices. Unlike DeFi yield farming, InvoFi yield is backed by an actual business obligation, not algorithmic token incentives.

**To use InvoFi as a lender:**
- Create an account (email or Freighter wallet)
- Browse the invoice marketplace
- Submit offers with your preferred interest rate and duration
- Track your active investments in the portfolio view
- Earn yield when invoices are repaid

---

## Key Properties

| Property | Description |
| --- | --- |
| **Trustless** | Smart contracts enforce all terms — no counterparty trust required |
| **Transparent** | All transactions are public on the Stellar blockchain |
| **Permissionless** | Anyone with a Stellar wallet can participate |
| **Non-custodial** | InvoFi never holds user funds — wallets sign directly |
| **Free to deploy** | Vercel + Supabase + Stellar testnet = $0 infrastructure cost |
| **Open source** | MIT licensed — fork, extend, or deploy your own instance |
