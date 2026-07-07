/**
 * End-to-end AED payment cycle against a live validator (default: local).
 *
 *   solana-test-validator --reset --quiet &
 *   pnpm e2e
 *
 * Exercises the full Fils flow with fresh throwaway keys:
 *   issuer creates the dAED reference mint
 *   → faucet funds a buyer with dAED
 *   → merchant creates an AED 12.50 Solana Pay payment request
 *   → buyer pays it (transfer tagged with the reference key)
 *   → merchant finds & verifies the payment on-chain by reference only
 *   → a UAE-style receipt is issued with the on-chain proof
 */
import { generateKeyPairSigner } from '@solana/kit';
import {
    buildReceipt,
    createPaymentRequest,
    describeDaedMint,
    findPayment,
    formatAed,
    parseAed,
    guessClusterFromUrl,
} from '@fils/core';

import { createDaedMint, mintDaedTo, payAedRequest } from '@fils/daed';
import { airdropAndConfirm, rpcFromEnv } from '@fils/daed/node';

const { rpc, rpcUrl } = rpcFromEnv();
const cluster = guessClusterFromUrl(rpcUrl);
console.log(`e2e against ${cluster} (${rpcUrl})\n`);

const step = (title: string) => console.log(`\n=== ${title}`);

step('1. actors');
const issuer = await generateKeyPairSigner();
const merchant = await generateKeyPairSigner();
const buyer = await generateKeyPairSigner();
console.log(`issuer   ${issuer.address}`);
console.log(`merchant ${merchant.address}`);
console.log(`buyer    ${buyer.address}`);
await airdropAndConfirm(rpc, issuer.address, 1);
await airdropAndConfirm(rpc, buyer.address, 1);

step('2. issuer creates the dAED reference mint (Token-2022, 2 decimals, metadata, freeze authority)');
const { mint, signature: createSignature } = await createDaedMint(rpc, issuer);
const token = describeDaedMint(mint, cluster);
console.log(`mint ${mint}`);
console.log(`sig  ${createSignature}`);

step('3. faucet mints dAED 100.00 to the buyer');
const faucetSignature = await mintDaedTo(rpc, issuer, mint, buyer.address, parseAed('100'));
console.log(`sig  ${faucetSignature}`);

step('4. merchant creates an AED 12.50 payment request');
const request = createPaymentRequest({
    recipient: merchant.address,
    amountFils: parseAed('12.50'),
    token,
    label: 'Fils Café',
    message: 'Order #42 — karak & luqaimat',
    memo: 'order-42',
});
console.log(`reference ${request.reference}`);
console.log(`url       ${request.url}`);

step('5. buyer pays the request');
const paymentSignature = await payAedRequest(rpc, buyer, request);
console.log(`sig  ${paymentSignature}`);

step('6. merchant verifies the payment on-chain (by reference only)');
const verification = await findPayment({ rpc, request });
if (verification.status !== 'confirmed') {
    console.error(`verification failed: ${JSON.stringify(verification)}`);
    process.exit(1);
}
console.log(`status     ${verification.status}`);
console.log(`signature  ${verification.signature}`);
console.log(`amount     ${formatAed(verification.amountFils)} (${formatAed(verification.amountFils, 'ar')})`);
if (verification.signature !== paymentSignature) {
    console.error('verified signature does not match the payment signature');
    process.exit(1);
}

step('7. receipt');
const receipt = buildReceipt({
    receiptNumber: 'FILS-E2E-0001',
    issuedAt: new Date(),
    seller: { name: 'Fils Café', trn: '100000000000003' },
    lines: [
        { description: 'Karak chai', quantity: 3, unitFils: parseAed('1.50') },
        { description: 'Luqaimat', quantity: 1, unitFils: parseAed('8.00') },
    ],
    payment: {
        cluster,
        mint,
        recipient: merchant.address,
        reference: request.reference,
        signature: verification.signature,
        slot: verification.slot,
        blockTime: verification.blockTime,
    },
});
console.log(JSON.stringify(receipt, null, 2));

console.log('\n✅ e2e payment cycle complete');
