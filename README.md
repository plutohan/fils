# Fils — the dirham layer for Solana payments

> **fils** /fɪls/ — the minor unit of the UAE dirham. 1 AED = 100 fils.

**Fils is an open-source toolkit that brings the UAE dirham to Solana**: a
regulation-shaped AED reference token, an SDK for accepting AED payments, a
merchant checkout you can fork, and a developer playbook for building
compliant payment apps in the UAE.

Apache-2.0. Built to be picked up — by developers, by merchants, and by the
regulated AED stablecoin issuers who have not deployed on Solana *yet*.

## Why this exists

Since June 2025, the Central Bank of the UAE's [Payment Token Services
Regulation](https://rulebook.centralbank.ae/en/rulebook/payment-token-services-regulation)
makes **licensed dirham-backed payment tokens the only crypto a UAE mainland
merchant may accept for goods and services**. USD stablecoins are out for
domestic payments; AED stablecoins are in.

Five regulated AED tokens now exist (AE Coin, Zand AED, DDSC, USDU, RAKBank's
instrument) — **none of them on Solana**. Meanwhile Solana is the chain where
retail payments actually work: ~400 ms finality, sub-cent fees, an existing
payments stack ([Solana Pay](https://docs.solanapay.com/),
[commerce-kit](https://github.com/solana-foundation/commerce-kit),
[pay-kit](https://github.com/solana-foundation/pay-kit)), and Token-2022
extensions (transfer hooks, freeze, confidential transfer) that map almost
one-to-one onto what the CBUAE requires from a payment token issuer.

What's missing is the connective tissue. Fils is that tissue:

| Piece | What it is | Who it's for |
| --- | --- | --- |
| [`programs/daed-gate`](programs/daed-gate) | **Token ACL (sRFC37) perimeter** — default-frozen mint + attestation-gated *permissionless thaw*; transfers stay standard. The recommended compliance path | AED issuers evaluating Solana |
| [`programs/daed-hook`](programs/daed-hook) | Token-2022 **transfer-hook allowlist program** — the same perimeter enforced on every transfer, for when per-transfer logic is genuinely required | AED issuers needing strict per-transfer control |
| [`scripts`](packages/scripts) | Create **dAED**, a devnet AED reference token (Token-2022, 2 decimals = fils, metadata, freeze authority) + faucet | Developers who need AED to build against today |
| [`@fils/core`](packages/core) | TypeScript SDK: AED token registry, fils-precise amounts with AR/EN formatting, Solana Pay-compatible payment requests, on-chain payment verification, UAE-e-invoice-aligned receipts | Payment app builders |
| [`apps/demo`](apps/demo) | Merchant checkout / POS demo (Arabic RTL + English): QR → pay → verified receipt → downloadable **PINT AE e-invoice** | Merchants & hackathon teams |
| [`@fils/einvoice`](packages/einvoice) | **UAE e-invoice XML** (Peppol PINT AE) from Fils receipts — mandate waves start Jan 2027 | VAT-registered merchants & their ASPs |
| [`@fils/agent402`](packages/agent402) | **AED agentic payments**: an x402-style HTTP 402 paywall settled in dAED, with the agent-side pay-and-retry client | AI-agent & API builders |
| [`docs/playbook.md`](docs/playbook.md) | **UAE Solana Payments Playbook** — PTSR, Federal Decree-Law 6/2025, VARA and free-zone carve-outs mapped to a Solana stack | Everyone shipping payments in the UAE |

## Why Solana

- **Retail QR payments are only viable with sub-second finality and sub-cent
  fees.** A karak chai costs 1.5 AED; a payment rail that costs cents or
  settles in minutes cannot carry it.
- **Token-2022 is the only mainstream token standard with issuer controls as
  first-class extensions** — transfer hooks (allowlists), default account
  state, freeze, permanent delegate, confidential transfer. The CBUAE's
  requirements for payment token issuers (control over distribution,
  redemption at par, sanctions compliance) become *token configuration*, not
  custom L1 work.
- **The payments stack already exists.** Fils does not reinvent Solana Pay or
  commerce-kit — it adds the dirham-specific layer on top: the token, the
  registry, the compliance shape, the localization, the playbook.

## Quickstart

```bash
pnpm install
pnpm build && pnpm test

# Full local end-to-end payment cycle (starts against a local validator):
#   create dAED mint → faucet a buyer → create AED 12.50 payment request
#   → pay it → verify on-chain → print the receipt
solana-test-validator --reset --quiet &   # in another terminal
pnpm e2e

pnpm e2e:gate   # Token ACL perimeter: frozen-by-default → attest → thaw → pay → revoke (needs `anchor build` + deploy)
pnpm e2e:402    # agentic payments: HTTP 402 challenge → agent pays AED 0.25 on-chain → resource
```

Then open the merchant demo:

```bash
pnpm --filter demo dev
# http://localhost:3000 — pick items, get a Solana Pay QR, pay from a wallet
```

## The dAED reference token

dAED is **not** an AED stablecoin. It is an unbacked devnet **reference
implementation** of what a CBUAE-shaped AED payment token looks like on
Solana:

- Token-2022 mint, **2 decimals** — on-chain integer amounts are literal fils
- Metadata extension (name/symbol/URI) — no external metadata dependency
- Freeze authority retained by the issuer (PTSR: issuer control, law
  enforcement response)
- Optional transfer-hook allowlist ([`programs/daed-hook`](programs/daed-hook)):
  restrict transfers to allowlisted (KYC'd) wallets — the strictest reading of
  a licensed distribution perimeter, ready to switch on

Real issuers replace the faucet with reserves and licensing; the token shape,
the SDK, and the merchant flow carry over unchanged — that is the point.

## Status & roadmap

This repository is a working MVP (local validator + devnet). Roadmap:

1. **M1 — Reference token & hook program on devnet**, faucet, issuer design
   note.
2. **M2 — SDK v0.1 + hosted merchant demo** (AR/EN), end-to-end demo video.
3. **M3 — Playbook legal review** (with a UAE virtual-asset law firm),
   issuer integration guide, workshop at a Superteam UAE event, mainnet-ready
   v0.1 release.

## Not legal advice

The playbook and every regulatory note in this repository are developer
documentation, not legal advice. Primary sources are linked throughout;
verify with counsel before shipping a regulated service.

## License

[Apache-2.0](LICENSE)
