# Fils: the dirham layer for Solana payments

> **fils** /fɪls/: the minor unit of the UAE dirham. 1 AED = 100 fils.

**Fils is an open-source toolkit that brings the UAE dirham to Solana**: a
regulation-shaped AED reference token, an SDK for accepting AED payments, a
merchant checkout you can fork, and a developer playbook for building
compliant payment apps in the UAE.

Apache-2.0. Built to be picked up: by developers, by merchants, and by the
regulated AED stablecoin issuers who have not deployed on Solana *yet*.

## Why this exists

Under the Central Bank of the UAE's [Payment Token Services
Regulation](https://rulebook.centralbank.ae/en/rulebook/payment-token-services-regulation)
(in full enforcement since mid-2026), **licensed dirham payment tokens are the
only crypto a UAE mainland merchant may accept for goods and services** (free
zones excepted). USD stablecoins are out for domestic payments; AED tokens are
in.

The CBUAE's February 2026 register lists three licensed dirham-token issuers
(AED StableCoin / AE Coin, Zand Trust / Zand AED, AEDC); DDSC added operational
approval in mid-2026. As of July 2026 **none is confirmed live on Solana**
(AE Coin on its own rails, Zand AED on the XRP Ledger, DDSC on ADI Chain). That
is a dated finding, not a permanent fact. Meanwhile Solana is where retail
payments actually work: ~400 ms finality, sub-cent fees, an existing payments
stack ([Solana Pay](https://docs.solanapay.com/),
[commerce-kit](https://github.com/solana-foundation/commerce-kit),
[pay-kit](https://github.com/solana-foundation/pay-kit)), and Token-2022
extensions (transfer hooks, freeze, confidential transfer) that give an issuer
the building blocks to implement its compliance obligations at the token level.

What's missing is the connective tissue. Fils is that tissue:

| Piece | What it is | Who it's for |
| --- | --- | --- |
| [`programs/daed-gate`](programs/daed-gate) | **Token ACL (sRFC37) perimeter**: default-frozen mint + *permissionless thaw* gated by KYC attestations, including **real Solana Attestation Service credentials**; transfers stay standard. One issuer-control design (not an architecture the regulation dictates) | AED issuers evaluating Solana |
| [`programs/daed-hook`](programs/daed-hook) | Token-2022 **transfer-hook allowlist program**: the same perimeter enforced on every transfer, for when per-transfer logic is genuinely required | AED issuers needing strict per-transfer control |
| [`scripts`](packages/scripts) | Create **dAED**, a devnet AED reference token (Token-2022, 2 decimals = fils, metadata, freeze authority) + faucet | Developers who need AED to build against today |
| [`@fils/core`](packages/core) | TypeScript SDK: AED token registry, fils-precise amounts with AR/EN formatting, Solana Pay-compatible payment requests, on-chain payment verification, UAE-e-invoice-aligned receipts | Payment app builders |
| [`apps/demo`](apps/demo) | Merchant checkout / POS demo (Arabic RTL + English): QR → pay → verified receipt → downloadable **PINT AE e-invoice** | Merchants & hackathon teams |
| [`@fils/einvoice`](packages/einvoice) | **UAE e-invoice XML** (Peppol PINT AE) from Fils receipts. Mandate waves start Jan 2027 | VAT-registered merchants & their ASPs |
| [`@fils/agent402`](packages/agent402) | **AED agentic payments**: an x402-style HTTP 402 paywall settled in dAED, with the agent-side pay-and-retry client (single-instance reference; a replicated deployment needs a shared settlement store) | AI-agent & API builders |
| [`docs/playbook.md`](docs/playbook.md) | **UAE Solana Payments Playbook**: PTSR, Federal Decree-Law 6/2025, VARA and free-zone carve-outs mapped to a Solana stack | Everyone shipping payments in the UAE |

## Why Solana

- **Retail QR payments are only viable with sub-second finality and sub-cent
  fees.** A karak chai costs 1.5 AED; a payment rail that costs cents or
  settles in minutes cannot carry it.
- **Token-2022 exposes issuer controls as first-class extensions**: transfer
  hooks (allowlists), default account state, freeze, permanent delegate,
  confidential transfer. An issuer's obligations (control over distribution,
  redemption at par, sanctions compliance) can be built from these as *token
  configuration* rather than custom L1 work. These are design options, not an
  architecture the regulation dictates.
- **The payments stack already exists.** Fils does not reinvent Solana Pay or
  commerce-kit; it adds the dirham-specific layer on top: the token, the
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
# http://localhost:3000 (pick items, get a Solana Pay QR, pay from a wallet)
```

## Live on devnet

The reference token and both compliance programs are deployed and verifiable on
Solana **devnet** right now:

| What | Address | Explorer |
| --- | --- | --- |
| dAED reference mint (Token-2022) | `59YMGgi9UwUMJt7dMbhumQKno3rdyf9paNyArutxybr1` | [view](https://explorer.solana.com/address/59YMGgi9UwUMJt7dMbhumQKno3rdyf9paNyArutxybr1?cluster=devnet) |
| `daed-gate` program (Token ACL / SAS) | `HfYBcwBTbHdtNmAD1Kcu8WSxwECfoSX3ELc77qEnzqWG` | [view](https://explorer.solana.com/address/HfYBcwBTbHdtNmAD1Kcu8WSxwECfoSX3ELc77qEnzqWG?cluster=devnet) |
| `daed-hook` program (transfer-hook allowlist) | `WVoJTCXkkLWip4rSP3ho3N9bAoZdcAsoHJEGtjmqkU1` | [view](https://explorer.solana.com/address/WVoJTCXkkLWip4rSP3ho3N9bAoZdcAsoHJEGtjmqkU1?cluster=devnet) |

`@fils/core` ships the devnet dAED as a built-in registry entry
(`DAED_DEVNET_MINT`), and every script targets devnet with
`RPC_URL=https://api.devnet.solana.com`.

## The dAED reference token

dAED is **not** an AED stablecoin. It is an unbacked devnet **reference
implementation** of what a CBUAE-shaped AED payment token looks like on
Solana:

- Token-2022 mint, **2 decimals**: on-chain integer amounts are literal fils
- Metadata extension (name/symbol/URI): no external metadata dependency
- Freeze authority retained by the issuer (PTSR: issuer control, law
  enforcement response)
- Optional transfer-hook allowlist ([`programs/daed-hook`](programs/daed-hook)):
  restrict who can *receive* to allowlisted (KYC'd) wallets, the strictest
  reading of a licensed distribution perimeter, ready to switch on

Real issuers replace the faucet with reserves and licensing; the token shape,
the SDK, and the merchant flow carry over unchanged. That is the point.

## Status & roadmap

This repository is a working MVP (local validator + devnet). Roadmap:

1. **M1: Reference token & hook program on devnet**, faucet, issuer design
   note.
2. **M2: SDK v0.1 + hosted merchant demo** (AR/EN), end-to-end demo video.
3. **M3: Playbook legal review** (with a UAE virtual-asset law firm),
   issuer integration guide, workshop at a Superteam UAE event, mainnet-ready
   v0.1 release.

## Not legal advice

The playbook and every regulatory note in this repository are developer
documentation, not legal advice. Primary sources are linked throughout;
verify with counsel before shipping a regulated service.

## License

[Apache-2.0](LICENSE)
