import {
    appendTransactionMessageInstructions,
    createTransactionMessage,
    getBase64EncodedWireTransaction,
    getSignatureFromTransaction,
    pipe,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
    type GetLatestBlockhashApi,
    type GetMinimumBalanceForRentExemptionApi,
    type GetSignatureStatusesApi,
    type Instruction,
    type KeyPairSigner,
    type Rpc,
    type SendTransactionApi,
    type Signature,
} from '@solana/kit';

/**
 * The RPC surface the dAED operations need — any `createSolanaRpc(...)`
 * satisfies it, on any cluster.
 */
export type DaedRpc = Rpc<
    GetLatestBlockhashApi & GetMinimumBalanceForRentExemptionApi & GetSignatureStatusesApi & SendTransactionApi
>;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sign with `feePayer`, send, and poll for confirmation. Polling (rather than
 * a websocket subscription) keeps consumers dependency-light and works
 * identically against the local validator and public clusters.
 */
export async function buildAndSend(
    rpc: DaedRpc,
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

    const signature = getSignatureFromTransaction(transaction);
    await rpc
        .sendTransaction(getBase64EncodedWireTransaction(transaction), {
            encoding: 'base64',
            preflightCommitment: 'confirmed',
        })
        .send();
    for (let attempt = 0; attempt < 60; attempt++) {
        const { value } = await rpc.getSignatureStatuses([signature]).send();
        const status = value[0];
        if (status) {
            if (status.err !== null) {
                throw new Error(`transaction ${signature} failed: ${JSON.stringify(status.err)}`);
            }
            if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
                return signature;
            }
        }
        await sleep(500);
    }
    throw new Error(`transaction ${signature} did not confirm in time`);
}
