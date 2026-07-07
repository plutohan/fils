# daed-hook — licensed-holder allowlist as a Token-2022 transfer hook

A reference implementation of the control a CBUAE-licensed dirham payment
token issuer needs on-chain: **a positive-permission distribution perimeter**.
Attached to a Token-2022 mint via the TransferHook extension, this program is
invoked by the token program itself on *every* transfer — wallet-to-wallet,
DEX fill, CPI — and fails the transfer unless the destination owner holds an
active allowlist entry created by the issuer.

## Why this maps to the PTSR

The CBUAE Payment Token Services Regulation expects a licensed issuer to
control how its dirham token is distributed and to be able to act on
unlawful use. On Token-2022 that decomposes into:

| Regulatory need | Token-2022 mechanism | Where |
| --- | --- | --- |
| Distribution perimeter (KYC'd holders only) | TransferHook → this program's allowlist | `transfer_hook` |
| Suspend a holder | `set_allowed(wallet, false)` (reversible, no account close) | `set_allowed` |
| Freeze a specific token account | Mint freeze authority (native) | issuer ops |
| Redemption at par | issuer burn/mint against reserves | issuer ops |

A permissive issuer can simply ship the mint **without** the hook (dAED's
default) — the point of this program is that the strict reading is *also*
just configuration on Solana, not custom infrastructure.

## Design

- **Allowlist entry PDA**: `["allow", mint, wallet]` → `AllowEntry { allowed }`.
  Existence at the derived address *is* the membership proof; the `allowed`
  flag makes revocation cheap and reversible.
- **ExtraAccountMetaList**: initialized once per mint at
  `["extra-account-metas", mint]`, declaring one extra account resolved from
  the *destination token account's owner* (account-data seed, offset 32,
  length 32). Wallets and clients resolve it automatically per the SPL
  transfer-hook interface — no custom client code to pay someone.
- **`transferring` check**: Execute rejects invocations that don't come from
  inside a real Token-2022 transfer (the TransferHookAccount extension flag).
- **Authority**: both `initialize_extra_account_meta_list` and `set_allowed`
  are gated to the mint authority — the issuer.

## Instructions

| Instruction | Discriminator | Signer | Effect |
| --- | --- | --- | --- |
| `initialize_extra_account_meta_list` | SPL interface | mint authority | create the meta list PDA for the mint |
| `execute` (transfer hook) | SPL interface | — (CPI from Token-2022) | require active allowlist entry for destination owner |
| `set_allowed(wallet, allowed)` | Anchor | mint authority | create/flip a wallet's entry |

## Build & deploy

```bash
anchor build                       # workspace root; artifact: target/deploy/daed_hook.so
solana program deploy target/deploy/daed_hook.so \
  --program-id target/deploy/daed_hook-keypair.json
```

Verified: builds with Anchor 1.0.2 and deploys to a local Agave 4.0 validator.
On-chain integration tests (hooked mint end-to-end: allowlisted transfer
passes, non-allowlisted fails) are milestone M1 of the roadmap.

**This is reference code. Audit before any mainnet use.**
