/**
 * On-chain e2e for the Token ACL (sRFC37) pattern: default-frozen dAED +
 * daed-gate attestation-gated permissionless thaw.
 *
 *   solana-test-validator (running) + daed_gate.so deployed
 *   pnpm --filter @fils/scripts e2e:gate
 *
 * Scenario:
 *   1. issuer creates dAED with DefaultAccountState=Frozen
 *   2. issuer hands freeze authority to the gate PDA + initializes the gate
 *      (attestor = separate key, modeling an IDV provider)
 *   3. NEGATIVE: buyer's fresh ATA is frozen — faucet mint fails
 *   4. attestor attests buyer + merchant → permissionless thaw both
 *   5. faucet + AED 12.50 payment succeed; verified by reference
 *   6. NEGATIVE: outsider without attestation cannot thaw
 *   7. attestor revokes buyer + freezes their account → transfer fails
 */
import { generateKeyPairSigner } from '@solana/kit';
import {
    getCreateAssociatedTokenIdempotentInstruction,
    TOKEN_2022_PROGRAM_ADDRESS,
} from '@solana-program/token-2022';
import { createPaymentRequest, describeDaedMint, findPayment, guessClusterFromUrl, parseAed } from '@fils/core';
import {
    ataFor,
    attestWallet,
    buildAndSend,
    createDaedMint,
    freezeGatedAccount,
    initializeGate,
    mintDaedTo,
    payAedRequest,
    revokeWallet,
    thawGatedAccount,
} from '@fils/daed';
import { airdropAndConfirm, rpcFromEnv } from '@fils/daed/node';


const { rpc, rpcUrl } = rpcFromEnv();
const cluster = guessClusterFromUrl(rpcUrl);
console.log(`gate e2e against ${cluster} (${rpcUrl})`);

const step = (title: string) => console.log(`\n=== ${title}`);
let failures = 0;
const check = (ok: boolean, label: string) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
    if (!ok) failures += 1;
};

async function expectFailure(label: string, run: () => Promise<unknown>): Promise<void> {
    try {
        await run();
        check(false, `${label} (unexpectedly succeeded)`);
    } catch {
        check(true, label);
    }
}

step('1. actors + default-frozen dAED mint');
const issuer = await generateKeyPairSigner();
const attestor = await generateKeyPairSigner();
const merchant = await generateKeyPairSigner();
const buyer = await generateKeyPairSigner();
const outsider = await generateKeyPairSigner();
await airdropAndConfirm(rpc, issuer.address, 1);
await airdropAndConfirm(rpc, attestor.address, 1);
await airdropAndConfirm(rpc, buyer.address, 1);
const { mint } = await createDaedMint(rpc, issuer, { defaultFrozen: true });
const token = describeDaedMint(mint, cluster);
console.log(`mint ${mint}`);

step('2. freeze authority → gate PDA, initialize gate');
const { gateConfig } = await initializeGate(rpc, issuer, mint, attestor.address);
console.log(`gate config ${gateConfig}`);

step('3. NEGATIVE: fresh ATA is frozen — faucet must fail');
const buyerAta = await ataFor(mint, buyer.address);
await buildAndSend(rpc, buyer, [
    getCreateAssociatedTokenIdempotentInstruction({
        payer: buyer,
        owner: buyer.address,
        mint,
        ata: buyerAta,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    }),
]);
await expectFailure('mint to frozen (un-thawed) account fails', () =>
    mintDaedTo(rpc, issuer, mint, buyer.address, parseAed('100')),
);

step('4. attest + permissionless thaw (buyer & merchant)');
const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
await attestWallet(rpc, attestor, mint, buyer.address, expiry);
await attestWallet(rpc, attestor, mint, merchant.address, expiry);
await thawGatedAccount(rpc, buyer, mint, buyerAta, buyer.address);
const merchantAta = await ataFor(mint, merchant.address);
await buildAndSend(rpc, buyer, [
    getCreateAssociatedTokenIdempotentInstruction({
        payer: buyer,
        owner: merchant.address,
        mint,
        ata: merchantAta,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    }),
]);
await thawGatedAccount(rpc, buyer, mint, merchantAta, merchant.address);
check(true, 'attested wallets thawed permissionlessly');

step('5. faucet + payment on the gated mint');
await mintDaedTo(rpc, issuer, mint, buyer.address, parseAed('100'));
const request = createPaymentRequest({
    recipient: merchant.address,
    amountFils: parseAed('12.50'),
    token,
    label: 'Fils Café (gated)',
});
await payAedRequest(rpc, buyer, request);
const verification = await findPayment({ rpc, request });
check(verification.status === 'confirmed', `payment verified on gated mint (${verification.status})`);

step('6. NEGATIVE: outsider without attestation cannot thaw');
const outsiderAta = await ataFor(mint, outsider.address);
await buildAndSend(rpc, buyer, [
    getCreateAssociatedTokenIdempotentInstruction({
        payer: buyer,
        owner: outsider.address,
        mint,
        ata: outsiderAta,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    }),
]);
await expectFailure('thaw without attestation fails', () =>
    thawGatedAccount(rpc, buyer, mint, outsiderAta, outsider.address),
);

step('7. revoke + enforcement freeze → transfers stop');
await revokeWallet(rpc, attestor, mint, buyer.address);
await freezeGatedAccount(rpc, attestor, mint, buyerAta);
await expectFailure('transfer from frozen (revoked) account fails', () =>
    payAedRequest(rpc, buyer, createPaymentRequest({ recipient: merchant.address, amountFils: parseAed('1'), token })),
);
await expectFailure('re-thaw after revocation fails', () =>
    thawGatedAccount(rpc, buyer, mint, buyerAta, buyer.address),
);

step('8. NEGATIVE: a gate cannot be attached to a non-default-frozen mint');
const { mint: plainMint } = await createDaedMint(rpc, issuer, {}); // not default-frozen
await expectFailure('gate init on a non-default-frozen mint fails', () =>
    initializeGate(rpc, issuer, plainMint, attestor.address),
);

if (failures > 0) {
    console.error(`\n❌ gate e2e: ${failures} check(s) failed`);
    process.exit(1);
}
console.log('\n✅ gate e2e complete: default-frozen mint, attestation-gated thaw, revocation enforced');
