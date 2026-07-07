/**
 * Create the dAED reference mint on the cluster pointed to by RPC_URL
 * (default: local validator) and persist its address to .fils-local/daed.json
 * for the faucet and the demo app.
 *
 *   pnpm --filter @fils/scripts daed:create
 *   RPC_URL=https://api.devnet.solana.com pnpm --filter @fils/scripts daed:create
 */
import { guessClusterFromUrl } from '@fils/core';

import { airdropAndConfirm, rpcFromEnv } from './common.js';
import { loadOrCreateSigner, saveDaedMintState } from '@fils/daed/node';
import { createDaedMint } from '@fils/daed';

const { rpc, rpcUrl } = rpcFromEnv();
const cluster = guessClusterFromUrl(rpcUrl);
const issuer = await loadOrCreateSigner('issuer');

console.log(`cluster : ${cluster} (${rpcUrl})`);
console.log(`issuer  : ${issuer.address}`);

const { value: balance } = await rpc.getBalance(issuer.address).send();
if (balance < 100_000_000n) {
    console.log('funding issuer via airdrop…');
    await airdropAndConfirm(rpc, issuer.address, 1);
}

const { mint, signature } = await createDaedMint(rpc, issuer);
await saveDaedMintState({ mint, cluster, createdAt: new Date().toISOString() });

console.log(`dAED mint created: ${mint}`);
console.log(`signature        : ${signature}`);
console.log('state written to .fils-local/daed.json');
