# Security Policy

## Supported Versions

InvoFi is currently in active development on Stellar testnet. The following versions receive security updates:

| Version | Status |
| --- | --- |
| `main` branch | Actively maintained |
| Older branches | Not supported |

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.** Public disclosure before a fix is ready puts users at risk.

### How to report

1. Go to the [GitHub Security Advisories](https://github.com/Stellar-VaultLink/invofi/security/advisories/new) page for this repo.
2. Click **"New draft security advisory"** and fill in the details.
3. We will acknowledge your report within 48 hours and provide an estimated timeline for a fix.

Alternatively, email the maintainer directly if you cannot use GitHub advisories. Include as much detail as possible:

- A description of the vulnerability
- Steps to reproduce it
- The potential impact
- Any suggested mitigations you are aware of

---

## What to Report

Please report anything that could harm users of the protocol, including:

- Smart contract vulnerabilities (reentrancy, authorization bypass, storage corruption)
- Frontend vulnerabilities (XSS, CSRF, wallet key exposure)
- Authentication bypass in Supabase RLS policies
- Dependency vulnerabilities with known exploits

---

## Out of Scope

The following are considered out of scope for security reports:

- Issues in dependencies that do not directly affect InvoFi users
- Social engineering attacks
- Rate limiting or denial-of-service on the testnet
- Theoretical vulnerabilities without a proof of concept

---

## Disclosure Policy

Once a fix is released, we will:

1. Publish a GitHub Security Advisory crediting the reporter (with their permission).
2. Tag a new release with the fix.
3. Update this file if the scope of supported versions changes.

We appreciate responsible disclosure and will acknowledge contributors in our release notes.
