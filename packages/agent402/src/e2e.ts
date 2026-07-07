/**
 * e2e for the AED 402 paywall: an "agent" pays a dirham-denominated 402
 * challenge on-chain and gets the resource; replays and over-budget prices
 * are rejected.
 *
 *   solana-test-validator (running) + a dAED mint (`daed:create`)
 *   pnpm --filter @fils/agent402 e2e
 */
import { address, generateKeyPairSigner } from '@solana/kit';
import { describeDaedMint, parseAed, type SolanaCluster } from '@fils/core';
import { mintDaedTo } from '@fils/daed';
import { airdropAndConfirm, loadDaedMintState, loadOrCreateSigner, rpcFromEnv } from '@fils/daed/node';

import { createAgent402Server, payAndFetch, type PaymentChallenge } from './server.js';

const { rpc } = rpcFromEnv();
const daedState = await loadDaedMintState();
if (!daedState) {
    console.error('no dAED mint — run `pnpm --filter @fils/scripts daed:create` first');
    process.exit(1);
}
const token = describeDaedMint(daedState.mint, daedState.cluster as SolanaCluster);

let failures = 0;
const check = (ok: boolean, label: string) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

const issuer = await loadOrCreateSigner('issuer');
const seller = await generateKeyPairSigner();
const agent = await generateKeyPairSigner();
await airdropAndConfirm(rpc, agent.address, 1);
const price = parseAed('0.25');
await mintDaedTo(rpc, issuer, address(daedState.mint), agent.address, parseAed('1'));

const server = createAgent402Server({ rpc, token, seller: seller.address, priceFils: price });
await new Promise<void>(resolve => server.listen(0, resolve));
const serverAddress = server.address();
if (serverAddress === null || typeof serverAddress === 'string') {
    throw new Error('no ephemeral port');
}
const url = `http://127.0.0.1:${serverAddress.port}/api/oracle/aed-usd`;
console.log(`paywall listening at ${url}\n`);

// 1. Unpaid request → 402 with a dirham challenge.
const unpaid = await fetch(url);
const challenge = (await unpaid.json()) as PaymentChallenge;
check(unpaid.status === 402, `unpaid request → 402 (got ${unpaid.status})`);
check(challenge.accepts[0]?.maxAmountRequired === '0.25', 'challenge quotes AED 0.25');
check(challenge.accepts[0]?.paymentUrl.startsWith('solana:'), 'challenge carries a Solana Pay URL');

// 2. Agent pays the challenge on-chain and replays → 200 + data.
const paid = await payAndFetch(url, agent, rpc, { maxPriceFils: parseAed('0.50') });
check(paid.status === 200, `agent paid and got the resource (status ${paid.status})`);
const body = paid.body as { pair?: string; inverseRate?: number };
check(body.pair === 'AED/USD' && body.inverseRate === 3.6725, 'resource payload is the AED/USD rate');
check(typeof paid.paidSignature === 'string', `settled on-chain: ${paid.paidSignature?.slice(0, 20)}…`);

// 3. Replay protection: the exact proof that WAS paid cannot buy a second read.
const usedProof = Buffer.from(JSON.stringify({ reference: paid.paidReference })).toString('base64');
const replay = await fetch(url, { headers: { 'X-PAYMENT': usedProof } });
const replayBody = (await replay.json()) as { error?: string };
check(
    replay.status === 402 && replayBody.error === 'Payment proof already used',
    `used proof is rejected (status ${replay.status}: ${replayBody.error})`,
);

// 3b. An unpaid challenge's reference is also worthless.
const unpaidProof = Buffer.from(
    JSON.stringify({ reference: challenge.accepts[0]?.reference }),
).toString('base64');
const unpaidReplay = await fetch(url, { headers: { 'X-PAYMENT': unpaidProof } });
check(unpaidReplay.status === 402, `unpaid reference is rejected (status ${unpaidReplay.status})`);

// 4. Budget guard: the agent refuses prices above its limit.
let refused = false;
try {
    await payAndFetch(url, agent, rpc, { maxPriceFils: parseAed('0.10') });
} catch {
    refused = true;
}
check(refused, 'agent refuses a price above its budget');

server.close();
if (failures > 0) {
    console.error(`\n❌ agent402 e2e: ${failures} check(s) failed`);
    process.exit(1);
}
console.log('\n✅ agent402 e2e complete: 402 challenge → on-chain AED payment → resource; replay + budget guarded');
