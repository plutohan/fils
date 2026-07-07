/**
 * Create the dAED reference mint on the cluster pointed to by RPC_URL
 * (default: local validator) and persist its address to .fils-local/daed.json
 * for the faucet and the demo app.
 *
 *   pnpm --filter @fils/scripts daed:create [--default-frozen] [--confidential [auditor-elgamal-pubkey]]
 *   RPC_URL=https://api.devnet.solana.com pnpm --filter @fils/scripts daed:create
 *
 * --default-frozen: new token accounts start frozen (Token ACL / sRFC37
 *   pattern; pair with the daed-gate program for attestation-gated thaw).
 * --confidential: add the ConfidentialTransferMint extension (auto-approve),
 *   optionally followed by an auditor ElGamal pubkey (base58) that can
 *   decrypt all confidential transfer amounts.
 */
import { address } from '@solana/kit';
import { guessClusterFromUrl } from '@fils/core';
import { createDaedMint, type CreateDaedMintOptions } from '@fils/daed';
import { loadOrCreateSigner, saveDaedMintState } from '@fils/daed/node';

import { airdropAndConfirm, rpcFromEnv } from './common.js';

const args = process.argv.slice(2);
const options: CreateDaedMintOptions = {};
if (args.includes('--default-frozen')) {
    options.defaultFrozen = true;
}
const confidentialIndex = args.indexOf('--confidential');
if (confidentialIndex !== -1) {
    const auditorArg = args.at(confidentialIndex + 1);
    options.confidential =
        auditorArg !== undefined && !auditorArg.startsWith('--')
            ? { auditorElgamalPubkey: address(auditorArg) }
            : {};
}

const { rpc, rpcUrl } = rpcFromEnv();
const cluster = guessClusterFromUrl(rpcUrl);
const issuer = await loadOrCreateSigner('issuer');

console.log(`cluster : ${cluster} (${rpcUrl})`);
console.log(`issuer  : ${issuer.address}`);
console.log(`options : ${JSON.stringify(options)}`);

const { value: balance } = await rpc.getBalance(issuer.address).send();
if (balance < 100_000_000n) {
    console.log('funding issuer via airdrop…');
    await airdropAndConfirm(rpc, issuer.address, 1);
}

const { mint, signature } = await createDaedMint(rpc, issuer, options);
await saveDaedMintState({ mint, cluster, createdAt: new Date().toISOString() });

console.log(`dAED mint created: ${mint}`);
console.log(`signature        : ${signature}`);
console.log('state written to .fils-local/daed.json');
