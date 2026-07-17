# @fils/daed

Operations for **dAED**, the unbacked devnet reference AED token of the
[Fils](https://github.com/plutohan/fils) toolkit: create the Token-2022
mint (2 decimals = fils, metadata, freeze authority; optional
default-frozen and confidential-transfer variants), issuer mint-to
(faucet), and wallet-side payment of AED payment requests.

dAED is a test fixture for building against, not a stablecoin. Real
licensed AED tokens are registry entries in
[`@fils/core`](https://www.npmjs.com/package/@fils/core).

The `@fils/daed/node` subpath carries Node-only dev-state helpers
(persisted dev keypairs, the created mint address); never import it from
browser code. Apache-2.0.
