import {
    AccountRole,
    appendTransactionMessageInstructions,
    createTransactionMessage,
    generateKeyPairSigner,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
    type Address,
    type Instruction,
    type KeyPairSigner,
    type Signature,
} from '@solana/kit';
import { getCreateAccountInstruction } from '@solana-program/system';
import {
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

import { sendAndConfirm, type ScriptRpc } from './common.js';

export const DAED_NAME = 'Devnet AED (Fils reference)';
export const DAED_SYMBOL = 'dAED';
export const DAED_METADATA_URI = 'https://raw.githubusercontent.com/fils-money/fils/main/packages/scripts/daed-metadata.json';

async function buildAndSend(
    rpc: ScriptRpc,
    feePayer: KeyPairSigner,
    instructions: readonly Instruction[],
): Promise<Signature> {
    const { value: latestBlockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
    const transaction = await pipe(
        createTransactionMessage({ version: 0 }),
        message => setTransactionMessageFeePayerSigner(feePayer, message),
        message => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, message),
        message => appendTransactionMessageInstructions(instructions, message),
        signTransactionMessageWithSigners,
    );
    return await sendAndConfirm(rpc, transaction);
}

/**
 * Create the dAED reference mint: Token-2022, 2 decimals (raw amount = fils),
 * on-mint metadata (MetadataPointer + TokenMetadata extensions — no external
 * metadata program), and mint + freeze authority retained by the issuer, as
 * the CBUAE's Payment Token Services Regulation expects of an issuer.
 */
export async function createDaedMint(rpc: ScriptRpc, issuer: KeyPairSigner): Promise<{ mint: Address; signature: Signature }> {
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

    // The mint account is allocated without the variable-length TokenMetadata
    // extension (it is realloc'd by InitializeTokenMetadata), but funded with
    // enough rent for the final size.
    const spaceWithoutMetadata = BigInt(getMintSize([metadataPointer]));
    const spaceWithMetadata = BigInt(getMintSize([metadataPointer, tokenMetadata]));
    const rent = await rpc.getMinimumBalanceForRentExemption(spaceWithMetadata).send();

    const instructions: Instruction[] = [
        getCreateAccountInstruction({
            payer: issuer,
            newAccount: mint,
            space: spaceWithoutMetadata,
            lamports: rent,
            programAddress: TOKEN_2022_PROGRAM_ADDRESS,
        }),
        ...getPreInitializeInstructionsForMintExtensions(mint.address, [metadataPointer]),
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
    rpc: ScriptRpc,
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
    rpc: ScriptRpc,
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
