# daed-gate: attestation-gated permissionless thaw (Token ACL pattern)

The compliance perimeter for a regulated AED token in the shape the Solana
Foundation now recommends (**sRFC37 / Token ACL**): instead of intercepting
every transfer with a hook, the mint is created with
`DefaultAccountState = Frozen` and its **freeze authority is handed to this
program's GateConfig PDA**. A new token account is born frozen (unusable)
until it is thawed through the gate, and the thaw only succeeds when the
account owner holds a valid KYC attestation. After that, transfers are
completely standard: no per-transfer overhead, no DeFi composability loss.

Compare [`daed-hook`](../daed-hook): same regulatory goal, enforced on every
transfer. Use the hook only when logic genuinely must run per transfer;
default to this gate.

| Aspect | daed-gate (Token ACL pattern) | daed-hook (transfer hook) |
| --- | --- | --- |
| Logic runs | once, at account activation | every transfer |
| Transfer overhead | none | extra CUs + accounts |
| DeFi/wallet compatibility | standard token | rough (some protocols blacklist hooks) |
| Enforcement after revocation | explicit `freeze_wallet_account` | immediate (next transfer fails) |

## Roles (split the way SAS splits them)

- **Issuer** (mint authority): runs `initialize_gate`, may `freeze_wallet_account`.
- **Attestor** (an IDV provider in production, Sumsub/Civic-style):
  `attest` / `revoke` wallets, may `freeze_wallet_account`.
- **Anyone**: `thaw_account` (self-service onboarding, no issuer round-trip).

Revocation (`revoke`) and enforcement (`freeze_wallet_account`) are separate
compliance acts: revoking stops future thaws; freezing stops an existing
account. Re-attesting restores a revoked wallet (re-KYC).

## Instructions

| Instruction | Signer | Effect |
| --- | --- | --- |
| `initialize_gate(attestor)` | issuer | record attestor; verify freeze authority was handed to the gate PDA |
| `attest(wallet, expiry)` | attestor | create/refresh the KYC entry `["kyc", mint, wallet]` |
| `revoke(wallet)` | attestor | mark the entry revoked |
| `thaw_account` | None (permissionless) | CPI-thaw a token account iff its owner's entry is valid |
| `freeze_wallet_account` | issuer or attestor | CPI-freeze a token account (enforcement) |

## Flow

```bash
pnpm --filter @fils/scripts daed:create -- --default-frozen
# TS client (@fils/daed): initializeGate → attestWallet → thawGatedAccount
pnpm --filter @fils/scripts e2e:gate   # full on-chain scenario incl. negatives
```

## Solana Attestation Service mode (v2, delivered)

Initialize the gate with an SAS policy (`credential` + `schema`) and
`thaw_account_with_sas` accepts **real SAS attestations** instead of the
built-in registry: the account must be owned by the SAS program
(`22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG`), carry the Attestation
discriminator, match the trusted credential and schema, be bound to the
token-account owner via its nonce, and be unexpired. KYC once with a real
IDV provider (Sumsub/Civic-style), thaw anywhere this gate trusts them.

Notes: SAS-side revocation = closing the attestation (thaw then fails
naturally); the enforcement `freeze_wallet_account` stays with the
issuer/attestor. The attestation `data` payload is not inspected; field-
level policy belongs in the choice of schema. `expiry <= now` is rejected
(conservative if a schema uses 0-as-never). Verified end-to-end against the
mainnet-dumped SAS program on a local validator (`pnpm e2e:gate:sas`).

Production deployments should still prefer the audited Token ACL program
with this logic as a Gate Program.

**Reference code. Audit before mainnet use.**
