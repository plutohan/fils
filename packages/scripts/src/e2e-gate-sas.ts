/**
 * On-chain e2e for daed-gate v2: thaw gated by a REAL Solana Attestation
 * Service attestation (the SAS program dumped from mainnet, running at its
 * canonical id on the local validator).
 *
 *   solana program dump -um 22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG .fils-local/programs/sas.so
 *   solana-test-validator --reset --bpf-program 22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG .fils-local/programs/sas.so
 *   (deploy daed_gate.so) && pnpm --filter @fils/scripts e2e:gate:sas
 *
 * Scenario:
 *   1. An IDV provider creates its SAS credential + "fils-kyc" schema
 *   2. issuer creates a default-frozen dAED and initializes the gate with
 *      that credential+schema as the trusted SAS policy
 *   3. IDV attests buyer & merchant (nonce = wallet)
 *   4. buyer/merchant thaw PERMISSIONLESSLY via their SAS attestations,
 *      faucet + AED 12.50 payment verified
 *   5. NEGATIVE: outsider thawing with someone else's attestation fails
 *      (subject mismatch); registry-thaw against an SAS-only wallet fails
 */
import { generateKeyPairSigner } from '@solana/kit';
import {
    TOKEN_2022_PROGRAM_ADDRESS,
    getCreateAssociatedTokenIdempotentInstruction,
} from '@solana-program/token-2022';
import {
    deriveAttestationPda as deriveSasAttestationPda,
    deriveCredentialPda,
    deriveSchemaPda,
    getCreateAttestationInstruction,
    getCreateCredentialInstruction,
    getCreateSchemaInstruction,
} from 'sas-lib';
import { createPaymentRequest, describeDaedMint, findPayment, guessClusterFromUrl, parseAed } from '@fils/core';
import {
    ataFor,
    buildAndSend,
    createDaedMint,
    initializeGate,
    mintDaedTo,
    payAedRequest,
    thawGatedAccount,
    thawGatedAccountWithSas,
} from '@fils/daed';
import { airdropAndConfirm, rpcFromEnv } from '@fils/daed/node';

const { rpc, rpcUrl } = rpcFromEnv();
const cluster = guessClusterFromUrl(rpcUrl);
console.log(`gate+SAS e2e against ${cluster} (${rpcUrl})`);

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

step('1. IDV provider registers its SAS credential + fils-kyc schema');
const issuer = await generateKeyPairSigner();
const idv = await generateKeyPairSigner(); // Sumsub/Civic-style provider
const merchant = await generateKeyPairSigner();
const buyer = await generateKeyPairSigner();
const outsider = await generateKeyPairSigner();
await airdropAndConfirm(rpc, issuer.address, 1);
await airdropAndConfirm(rpc, idv.address, 1);
await airdropAndConfirm(rpc, buyer.address, 1);

const [credential] = await deriveCredentialPda({ authority: idv.address, name: 'Fils IDV' });
const [schema] = await deriveSchemaPda({ credential, name: 'fils-kyc', version: 1 });
await buildAndSend(rpc, idv, [
    getCreateCredentialInstruction({
        payer: idv,
        credential,
        authority: idv,
        name: 'Fils IDV',
        signers: [idv.address],
    }),
    getCreateSchemaInstruction({
        payer: idv,
        authority: idv,
        credential,
        schema,
        name: 'fils-kyc',
        description: 'KYC passed (Fils demo)',
        layout: new Uint8Array([0]), // one u8 field
        fieldNames: ['kyc'],
    }),
]);
console.log(`credential ${credential}`);
console.log(`schema     ${schema}`);

step('2. default-frozen dAED + gate trusting that SAS policy');
const { mint } = await createDaedMint(rpc, issuer, { defaultFrozen: true });
const token = describeDaedMint(mint, cluster);
const { gateConfig } = await initializeGate(rpc, issuer, mint, idv.address, { credential, schema });
console.log(`mint ${mint}`);
console.log(`gate ${gateConfig}`);

step('3. IDV attests buyer & merchant (nonce = wallet)');
const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
const attestationFor = async (wallet: typeof buyer.address) => {
    const [attestation] = await deriveSasAttestationPda({ credential, schema, nonce: wallet });
    await buildAndSend(rpc, idv, [
        getCreateAttestationInstruction({
            payer: idv,
            authority: idv,
            credential,
            schema,
            attestation,
            nonce: wallet,
            data: new Uint8Array([1]),
            expiry,
        }),
    ]);
    return attestation;
};
const buyerAttestation = await attestationFor(buyer.address);
const merchantAttestation = await attestationFor(merchant.address);
console.log(`buyer attestation    ${buyerAttestation}`);
console.log(`merchant attestation ${merchantAttestation}`);

step('4. permissionless SAS thaw → faucet → payment');
const createAta = async (owner: typeof buyer.address) => {
    const ata = await ataFor(mint, owner);
    await buildAndSend(rpc, buyer, [
        getCreateAssociatedTokenIdempotentInstruction({
            payer: buyer,
            owner,
            mint,
            ata,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        }),
    ]);
    return ata;
};
const buyerAta = await createAta(buyer.address);
const merchantAta = await createAta(merchant.address);
await thawGatedAccountWithSas(rpc, buyer, mint, buyerAta, buyerAttestation, credential, schema);
await thawGatedAccountWithSas(rpc, buyer, mint, merchantAta, merchantAttestation, credential, schema);
check(true, 'SAS-attested wallets thawed permissionlessly');

await mintDaedTo(rpc, issuer, mint, buyer.address, parseAed('100'));
const request = createPaymentRequest({
    recipient: merchant.address,
    amountFils: parseAed('12.50'),
    token,
    label: 'Fils Café (SAS-gated)',
});
await payAedRequest(rpc, buyer, request);
const verification = await findPayment({ rpc, request });
check(verification.status === 'confirmed', `payment verified on SAS-gated mint (${verification.status})`);

step("5. NEGATIVE: someone else's attestation does not thaw you");
const outsiderAta = await createAta(outsider.address);
await expectFailure('thaw with mismatched-subject attestation fails', () =>
    thawGatedAccountWithSas(rpc, buyer, mint, outsiderAta, buyerAttestation, credential, schema),
);
await expectFailure('registry-thaw without a registry entry fails', () =>
    thawGatedAccount(rpc, buyer, mint, outsiderAta, outsider.address),
);
await expectFailure('thaw with an untrusted credential account fails', () =>
    thawGatedAccountWithSas(rpc, buyer, mint, buyerAta, buyerAttestation, outsider.address, schema),
);

if (failures > 0) {
    console.error(`\n❌ gate+SAS e2e: ${failures} check(s) failed`);
    process.exit(1);
}
console.log('\n✅ gate+SAS e2e complete: real SAS attestations gate the dirham perimeter');
