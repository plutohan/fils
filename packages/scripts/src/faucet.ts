/**
 * Faucet: mint dAED to a wallet.
 *
 *   pnpm --filter @fils/scripts daed:faucet <wallet-address> [amount-aed]
 *
 * Requires a prior `daed:create` on the same cluster.
 */
import { address } from '@solana/kit';
import { formatAed, parseAed } from '@fils/core';

import { loadDaedMintState, loadOrCreateSigner, rpcFromEnv } from './common.js';
import { mintDaedTo } from '@fils/daed';

const [, , walletArg, amountArg] = process.argv;
if (!walletArg) {
    console.error('usage: daed:faucet <wallet-address> [amount-aed (default 100)]');
    process.exit(1);
}

const state = await loadDaedMintState();
if (!state) {
    console.error('no dAED mint found — run `pnpm --filter @fils/scripts daed:create` first');
    process.exit(1);
}

const { rpc } = rpcFromEnv();
const issuer = await loadOrCreateSigner('issuer');
const owner = address(walletArg);
const fils = parseAed(amountArg ?? '100');

const signature = await mintDaedTo(rpc, issuer, address(state.mint), owner, fils);
console.log(`minted ${formatAed(fils)} of dAED (${state.mint}) to ${owner}`);
console.log(`signature: ${signature}`);
