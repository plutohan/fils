# Grant Application — Solana Foundation UAE Grants (Superteam UAE)

## Project

**Fils — the dirham layer for Solana payments**
Open-source (Apache-2.0): <https://github.com/fils-money/fils> *(update link on publication)*

One-liner: *Everything needed to issue, accept, and verify AED payments on
Solana — a regulation-shaped reference token, an SDK, a merchant checkout,
and a compliance playbook — so the first regulated dirham stablecoin lands
on Solana instead of somewhere else.*

## The problem (why now, why UAE)

Since the CBUAE's Payment Token Services Regulation took full effect
(June 2025), **licensed dirham-backed stablecoins are the only crypto UAE
mainland merchants may accept for goods and services** — USD stablecoins are
excluded from domestic payments. Five regulated AED tokens now exist
(AE Coin, Zand AED, DDSC, USDU, RAKBank's instrument). **None of them are on
Solana.** Zand AED — the first multi-chain AED token on public blockchains —
launched on EVM chains and is evaluating XRPL.

Solana is objectively the best settlement layer for retail dirham payments
(~400 ms finality, sub-cent fees, Solana Pay, Token-2022 issuer controls),
but a UAE issuer evaluating Solana today finds: no AED token, no reference
for how their compliance obligations map to Token-2022, no AED-aware
merchant tooling, and no developer-readable account of the UAE rules. Every
month that gap persists, dirham liquidity and the UAE→Asia remittance
corridors being built on AED stablecoins accrue to other chains.

## What we built (already working) and what the grant funds

The MVP is **already public and verified end-to-end** against a local
validator — this application funds hardening, devnet/mainnet-readiness, legal
review, and ecosystem distribution.

Working today (all in the repo):

1. **dAED reference token** — Token-2022 mint with 2 decimals (raw amounts
   are literal fils), on-mint metadata, issuer freeze authority; creation
   script + faucet.
2. **daed-hook program** (Anchor) — a licensed-holder allowlist as an SPL
   transfer hook: every transfer fails unless the destination owner holds an
   issuer-created allowlist entry. The CBUAE distribution-perimeter
   requirement as ~200 lines of auditable configuration, not custom
   infrastructure. Builds and deploys (Anchor 1.0, Agave 4.0).
3. **@fils/core SDK** — AED token registry (a newly licensed token is a
   config entry, not a code change), fils-precise amounts with ar-AE/en-AE
   formatting, Solana Pay payment requests, reference-based on-chain
   verification, receipts carrying TRN + 5% VAT breakdown aligned with the
   incoming UAE e-invoicing mandate. 19 unit tests + scripted e2e.
4. **Fils Café** — a Next.js merchant checkout (Arabic RTL + English):
   cart → QR → sub-second confirmation → receipt with explorer proof,
   including a dev-mode simulated wallet so anyone can run the full flow in
   two commands.
5. **UAE Solana Payments Playbook** — the PTSR, Federal Decree-Law 6/2025,
   VARA and free-zone carve-outs mapped to the Solana stack, with primary
   sources.

## Public good

Everything is Apache-2.0 and built to be forked: issuers take the token
shape and hook program, developers take the SDK and checkout, everyone takes
the playbook. Nothing here is a business — it is the missing connective
tissue between UAE regulation and the Solana payments stack. We explicitly
build **on top of** existing Foundation tooling (Solana Pay, Token-2022,
kit) rather than duplicating it.

## Only possible on Solana

- Retail QR payments need sub-second finality and sub-cent fees — a 1.50 AED
  karak cannot carry correspondent-banking economics or L1 gas.
- Token-2022 is the only mainstream token standard where the issuer controls
  the PTSR demands (allowlist via transfer hooks, freeze, confidential
  transfer) are first-class *extensions* — we demonstrate the exact mapping.
- Solana Pay + kit + an installed wallet base mean the last mile already
  exists; Fils only adds the dirham layer.

## Milestones (9 weeks, $10k)

| # | Weeks | Deliverable | Amount |
| --- | --- | --- | --- |
| M1 | 1–3 | dAED + daed-hook live on **devnet** with on-chain hook e2e (allowlisted transfer passes, blocked transfer fails); hosted faucet; issuer design note | $3,000 |
| M2 | 4–6 | @fils/core v0.1 on npm; hosted Fils Café demo on devnet (AR/EN); 3-minute demo video; integration guide | $3,500 |
| M3 | 7–9 | Playbook reviewed by a UAE virtual-assets law firm; issuer integration brief shared with Zand / AE Coin / RAKBank contacts; hands-on workshop at a Superteam UAE event (SEZ side-event); v0.1 mainnet-ready release | $3,500 |

Measurable outcomes: SDK on npm with public devnet demo; ≥1 AED issuer
conversation opened with a concrete integration brief; ≥25 developers
through the workshop; playbook published as the reference for "can I build
this in the UAE?"; ≥3 external contributors.

## Budget notes

Funds cover full-time build time across the 9 weeks, legal review of the
playbook (fixed-fee scope), devnet/RPC/hosting costs, and workshop
logistics. No token, no equity, no paid marketing.

## Sustainability & long-term vision

Fils stays a public good. The win condition is external: a regulated AED
token deployed on Solana using (or informed by) this reference, with UAE
merchants accepting dirhams over Solana Pay. If that happens, the UAE→India/
Pakistan/Philippines remittance corridors — the largest AED flows that exist
— have a public, sub-cent settlement layer, and Solana is where dirham
liquidity lives. Post-grant, maintenance moves to community + issuer
partners; further work (corridor tooling, e-invoicing integration) can stand
on its own applications.

## Team

*(fill before submitting)*
- Name, Superteam Earn profile, UAE residency
- Relevant proof of work: this repository (link the commit history — the
  MVP was built and verified before applying)

## Links

- Repository: *(GitHub link after publication)*
- Demo video: *(M2)*
- Playbook: `docs/playbook.md`
- Live demo: *(devnet URL, M2)*
