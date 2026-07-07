/**
 * Standalone AED 402 paywall server (port 4020) against the persisted dAED
 * mint. Pair with any x402-aware client or `pnpm --filter @fils/agent402 e2e`.
 */
import { generateKeyPairSigner } from '@solana/kit';
import { describeDaedMint, formatAed, parseAed, type SolanaCluster } from '@fils/core';
import { loadDaedMintState, rpcFromEnv } from '@fils/daed/node';

import { createAgent402Server } from './server.js';

const { rpc, rpcUrl } = rpcFromEnv();
const daedState = await loadDaedMintState();
if (!daedState) {
    console.error('no dAED mint — run `pnpm --filter @fils/scripts daed:create` first');
    process.exit(1);
}
const token = describeDaedMint(daedState.mint, daedState.cluster as SolanaCluster);
const seller = await generateKeyPairSigner();
const price = parseAed(process.env['PRICE_AED'] ?? '0.25');

const server = createAgent402Server({ rpc, token, seller: seller.address, priceFils: price });
server.listen(4020, () => {
    console.log(`AED 402 paywall on http://127.0.0.1:4020/api/oracle/aed-usd (${rpcUrl})`);
    console.log(`price ${formatAed(price)} in ${token.symbol} (${token.mint}) → seller ${seller.address}`);
});
