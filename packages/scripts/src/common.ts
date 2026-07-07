import {
    createSolanaRpc,
    lamports,
    type Address,
    type Rpc,
    type SolanaRpcApi,
} from '@solana/kit';

/**
 * The RPC surface the scripts use. These scripts only ever target the local
 * validator or devnet/testnet, so the test-cluster API (which includes
 * `requestAirdrop`) is the honest type.
 */
export type ScriptRpc = Rpc<SolanaRpcApi>;

export const DEFAULT_RPC_URL = 'http://127.0.0.1:8899';

export function rpcFromEnv(): { rpc: ScriptRpc; rpcUrl: string } {
    const rpcUrl = process.env['RPC_URL'] ?? DEFAULT_RPC_URL;
    return { rpc: createSolanaRpc(rpcUrl) as ScriptRpc, rpcUrl };
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function airdropAndConfirm(rpc: ScriptRpc, recipient: Address, sol: number): Promise<void> {
    const amount = lamports(BigInt(Math.round(sol * 1_000_000_000)));
    const before = (await rpc.getBalance(recipient).send()).value;
    await rpc.requestAirdrop(recipient, amount, { commitment: 'confirmed' }).send();
    for (let attempt = 0; attempt < 60; attempt++) {
        const { value } = await rpc.getBalance(recipient, { commitment: 'confirmed' }).send();
        if (value >= before + amount) return;
        await sleep(500);
    }
    throw new Error(`airdrop of ${sol} SOL to ${recipient} did not confirm in time`);
}
