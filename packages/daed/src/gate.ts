/**
 * Client for the daed-gate program: attestation-gated permissionless thaw
 * for a default-frozen dAED mint (Token ACL / sRFC37 pattern).
 *
 * Instructions are built by hand (no Anchor JS dependency): Anchor's default
 * discriminator is sha256("global:<name>")[0..8], precomputed below so this
 * module stays isomorphic (no node:crypto).
 */
import {
    AccountRole,
    address,
    getAddressEncoder,
    getProgramDerivedAddress,
    type Address,
    type Instruction,
    type KeyPairSigner,
    type Signature,
} from '@solana/kit';
import {
    AuthorityType,
    TOKEN_2022_PROGRAM_ADDRESS,
    getSetAuthorityInstruction,
} from '@solana-program/token-2022';

import { buildAndSend, type DaedRpc } from './tx.js';

export const DAED_GATE_PROGRAM_ADDRESS = address('HfYBcwBTbHdtNmAD1Kcu8WSxwECfoSX3ELc77qEnzqWG');
export const SYSTEM_PROGRAM = address('11111111111111111111111111111111');

// sha256("global:<instruction_name>")[0..8]
const DISCRIMINATORS = {
    initializeGate: Uint8Array.from([41, 213, 207, 127, 15, 238, 192, 17]),
    attest: Uint8Array.from([83, 148, 120, 119, 144, 139, 117, 160]),
    revoke: Uint8Array.from([170, 23, 31, 34, 133, 173, 93, 242]),
    thawAccount: Uint8Array.from([115, 152, 79, 213, 213, 169, 184, 35]),
    freezeWalletAccount: Uint8Array.from([28, 157, 222, 211, 235, 104, 170, 48]),
} as const;

const addressBytes = (value: Address): Uint8Array => new Uint8Array(getAddressEncoder().encode(value));

export async function deriveGateConfigPda(mint: Address): Promise<Address> {
    const [pda] = await getProgramDerivedAddress({
        programAddress: DAED_GATE_PROGRAM_ADDRESS,
        seeds: ['gate', addressBytes(mint)],
    });
    return pda;
}

export async function deriveAttestationPda(mint: Address, wallet: Address): Promise<Address> {
    const [pda] = await getProgramDerivedAddress({
        programAddress: DAED_GATE_PROGRAM_ADDRESS,
        seeds: ['kyc', addressBytes(mint), addressBytes(wallet)],
    });
    return pda;
}

function instructionData(discriminator: Uint8Array, ...args: Uint8Array[]): Uint8Array {
    const total = args.reduce((length, arg) => length + arg.length, discriminator.length);
    const data = new Uint8Array(total);
    data.set(discriminator, 0);
    let offset = discriminator.length;
    for (const arg of args) {
        data.set(arg, offset);
        offset += arg.length;
    }
    return data;
}

function i64LeBytes(value: bigint): Uint8Array {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigInt64(0, value, true);
    return bytes;
}

/**
 * Hand the mint's freeze authority to the gate config PDA and initialize the
 * gate. Must run before any token account of the mint can ever be thawed.
 */
export async function initializeGate(
    rpc: DaedRpc,
    issuer: KeyPairSigner,
    mint: Address,
    attestor: Address,
): Promise<{ gateConfig: Address; signature: Signature }> {
    const gateConfig = await deriveGateConfigPda(mint);
    const setFreezeAuthority = getSetAuthorityInstruction({
        owned: mint,
        owner: issuer,
        authorityType: AuthorityType.FreezeAccount,
        newAuthority: gateConfig,
    });
    const initialize: Instruction = {
        programAddress: DAED_GATE_PROGRAM_ADDRESS,
        accounts: [
            { address: issuer.address, role: AccountRole.WRITABLE_SIGNER },
            { address: gateConfig, role: AccountRole.WRITABLE },
            { address: mint, role: AccountRole.READONLY },
            { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
        ],
        data: instructionData(DISCRIMINATORS.initializeGate, addressBytes(attestor)),
    };
    const signature = await buildAndSend(rpc, issuer, [setFreezeAuthority, initialize]);
    return { gateConfig, signature };
}

/** Attestor-only: record/refresh the KYC attestation for `wallet`. */
export async function attestWallet(
    rpc: DaedRpc,
    attestor: KeyPairSigner,
    mint: Address,
    wallet: Address,
    expiry: bigint,
): Promise<Signature> {
    const instruction: Instruction = {
        programAddress: DAED_GATE_PROGRAM_ADDRESS,
        accounts: [
            { address: attestor.address, role: AccountRole.WRITABLE_SIGNER },
            { address: await deriveGateConfigPda(mint), role: AccountRole.READONLY },
            { address: await deriveAttestationPda(mint, wallet), role: AccountRole.WRITABLE },
            { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
        ],
        data: instructionData(DISCRIMINATORS.attest, addressBytes(wallet), i64LeBytes(expiry)),
    };
    return await buildAndSend(rpc, attestor, [instruction]);
}

/** Attestor-only: revoke the attestation (does not freeze existing accounts). */
export async function revokeWallet(
    rpc: DaedRpc,
    attestor: KeyPairSigner,
    mint: Address,
    wallet: Address,
): Promise<Signature> {
    const instruction: Instruction = {
        programAddress: DAED_GATE_PROGRAM_ADDRESS,
        accounts: [
            { address: attestor.address, role: AccountRole.READONLY_SIGNER },
            { address: await deriveGateConfigPda(mint), role: AccountRole.READONLY },
            { address: await deriveAttestationPda(mint, wallet), role: AccountRole.WRITABLE },
        ],
        data: instructionData(DISCRIMINATORS.revoke, addressBytes(wallet)),
    };
    return await buildAndSend(rpc, attestor, [instruction]);
}

/**
 * PERMISSIONLESS thaw: succeeds iff `owner` (the token account's owner) holds
 * a valid attestation. `feePayer` may be anyone — typically the owner.
 */
export async function thawGatedAccount(
    rpc: DaedRpc,
    feePayer: KeyPairSigner,
    mint: Address,
    tokenAccount: Address,
    owner: Address,
): Promise<Signature> {
    const instruction: Instruction = {
        programAddress: DAED_GATE_PROGRAM_ADDRESS,
        accounts: [
            { address: tokenAccount, role: AccountRole.WRITABLE },
            { address: mint, role: AccountRole.READONLY },
            { address: await deriveGateConfigPda(mint), role: AccountRole.READONLY },
            { address: await deriveAttestationPda(mint, owner), role: AccountRole.READONLY },
            { address: TOKEN_2022_PROGRAM_ADDRESS, role: AccountRole.READONLY },
        ],
        data: instructionData(DISCRIMINATORS.thawAccount),
    };
    return await buildAndSend(rpc, feePayer, [instruction]);
}

/** Issuer- or attestor-only: re-freeze a token account (enforcement). */
export async function freezeGatedAccount(
    rpc: DaedRpc,
    authority: KeyPairSigner,
    mint: Address,
    tokenAccount: Address,
): Promise<Signature> {
    const instruction: Instruction = {
        programAddress: DAED_GATE_PROGRAM_ADDRESS,
        accounts: [
            { address: authority.address, role: AccountRole.READONLY_SIGNER },
            { address: tokenAccount, role: AccountRole.WRITABLE },
            { address: mint, role: AccountRole.READONLY },
            { address: await deriveGateConfigPda(mint), role: AccountRole.READONLY },
            { address: TOKEN_2022_PROGRAM_ADDRESS, role: AccountRole.READONLY },
        ],
        data: instructionData(DISCRIMINATORS.freezeWalletAccount),
    };
    return await buildAndSend(rpc, authority, [instruction]);
}
