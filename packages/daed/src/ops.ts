import {
    AccountRole,
    generateKeyPairSigner,
    type Address,
    type Instruction,
    type KeyPairSigner,
    type Signature,
} from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
import {
    AccountState,
    TOKEN_2022_PROGRAM_ADDRESS,
    extension,
    findAssociatedTokenPda,
    getCreateAssociatedTokenIdempotentInstruction,
    getInitializeMintInstruction,
    getMintSize,
    getMintToCheckedInstruction,
    getPostInitializeInstructionsForMintExtensions,
    getPreInitializeInstructionsForMintExtensions,
    getTransferCheckedInstruction,
} from '@solana-program/token-2022';
import { AED_DECIMALS, type AedPaymentRequest } from '@fils/core';

import { buildAndSend, type DaedRpc } from './tx.js';

export const DAED_NAME = 'Devnet AED (Fils reference)';
export const DAED_SYMBOL = 'dAED';
export const DAED_METADATA_URI =
    'https://raw.githubusercontent.com/fils-money/fils/main/packages/daed/daed-metadata.json';

export interface CreateDaedMintOptions {
    /**
     * Initialize every new token account frozen (DefaultAccountState
     * extension). This is the Token ACL / sRFC37 pattern: nobody can receive
     * dAED until their account is thawed through a gate (see the daed-gate
     * program). Off by default — the permissive dAED needs no perimeter.
     */
    defaultFrozen?: boolean;
    /**
     * Add the ConfidentialTransferMint extension (accounts auto-approved).
     * Amounts of confidential transfers are hidden from the public but, when
     * `auditorElgamalPubkey` is set, remain decryptable by the auditor — the
     * regulator-palatable privacy shape (not a "privacy token").
     */
    confidential?: { auditorElgamalPubkey?: Address };
}

/**
 * Create the dAED reference mint: Token-2022, 2 decimals (raw amount = fils),
 * on-mint metadata (MetadataPointer + TokenMetadata extensions — no external
 * metadata program), and mint + freeze authority retained by the issuer, as
 * the CBUAE's Payment Token Services Regulation expects of an issuer.
 */
export async function createDaedMint(
    rpc: DaedRpc,
    issuer: KeyPairSigner,
    options: CreateDaedMintOptions = {},
): Promise<{ mint: Address; signature: Signature }> {
    const mint = await generateKeyPairSigner();

    const metadataPointer = extension('MetadataPointer', {
        authority: issuer.address,
        metadataAddress: mint.address,
    });
    const tokenMetadata = extension('TokenMetadata', {
        updateAuthority: issuer.address,
        mint: mint.address,
        name: DAED_NAME,
        symbol: DAED_SYMBOL,
        uri: DAED_METADATA_URI,
        additionalMetadata: new Map<string, string>(),
    });
    const fixedExtensions = [
        ...(options.defaultFrozen ? [extension('DefaultAccountState', { state: AccountState.Frozen })] : []),
        ...(options.confidential
            ? [
                  extension('ConfidentialTransferMint', {
                      authority: issuer.address,
                      autoApproveNewAccounts: true,
                      auditorElgamalPubkey: options.confidential.auditorElgamalPubkey ?? null,
                  }),
              ]
            : []),
        metadataPointer,
    ];

    // The mint account is allocated without the variable-length TokenMetadata
    // extension (it is realloc'd by InitializeTokenMetadata), but funded with
    // enough rent for the final size.
    const spaceWithoutMetadata = BigInt(getMintSize(fixedExtensions));
    const spaceWithMetadata = BigInt(getMintSize([...fixedExtensions, tokenMetadata]));
    const rent = await rpc.getMinimumBalanceForRentExemption(spaceWithMetadata).send();

    const instructions: Instruction[] = [
        getCreateAccountInstruction({
            payer: issuer,
            newAccount: mint,
            space: spaceWithoutMetadata,
            lamports: rent,
            programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        }),
        ...getPreInitializeInstructionsForMintExtensions(mint.address, fixedExtensions),
        getInitializeMintInstruction({
            mint: mint.address,
            decimals: AED_DECIMALS,
            mintAuthority: issuer.address,
            freezeAuthority: issuer.address,
        }),
        ...getPostInitializeInstructionsForMintExtensions(mint.address, issuer, [tokenMetadata]),
    ];

    const signature = await buildAndSend(rpc, issuer, instructions);
    return { mint: mint.address, signature };
}

export async function ataFor(mint: Address, owner: Address): Promise<Address> {
    const [ata] = await findAssociatedTokenPda({
        mint,
        owner,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    });
    return ata;
}

/** Faucet: mint `fils` of dAED to `owner` (creating their ATA if needed). */
export async function mintDaedTo(
    rpc: DaedRpc,
    issuer: KeyPairSigner,
    mint: Address,
    owner: Address,
    fils: bigint,
): Promise<Signature> {
    const ata = await ataFor(mint, owner);
    return await buildAndSend(rpc, issuer, [
        getCreateAssociatedTokenIdempotentInstruction({
            payer: issuer,
            owner,
            mint,
            ata,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        }),
        getMintToCheckedInstruction({
            mint,
            token: ata,
            mintAuthority: issuer,
            amount: fils,
            decimals: AED_DECIMALS,
        }),
    ]);
}

/**
 * Pay an AED payment request — the wallet side of the Solana Pay handshake.
 * The request's reference key is appended to the transfer instruction as a
 * read-only account so the merchant can find the payment on-chain.
 */
export async function payAedRequest(
    rpc: DaedRpc,
    buyer: KeyPairSigner,
    request: AedPaymentRequest,
): Promise<Signature> {
    const mint = request.token.mint;
    const source = await ataFor(mint, buyer.address);
    const destination = await ataFor(mint, request.recipient);

    const transfer = getTransferCheckedInstruction({
        source,
        mint,
        destination,
        authority: buyer,
        amount: request.amountFils,
        decimals: AED_DECIMALS,
    });
    const transferWithReference: Instruction = {
        ...transfer,
        accounts: [...(transfer.accounts ?? []), { address: request.reference, role: AccountRole.READONLY }],
    };

    return await buildAndSend(rpc, buyer, [
        getCreateAssociatedTokenIdempotentInstruction({
            payer: buyer,
            owner: request.recipient,
            mint,
            ata: destination,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        }),
        transferWithReference,
    ]);
}
