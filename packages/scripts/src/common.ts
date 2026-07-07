import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    createKeyPairSignerFromPrivateKeyBytes,
    createSolanaRpc,
    lamports,
    type Address,
    type KeyPairSigner,
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

export function clusterFromRpcUrl(rpcUrl: string): 'localnet' | 'devnet' | 'testnet' | 'mainnet-beta' {
    if (rpcUrl.includes('devnet')) return 'devnet';
    if (rpcUrl.includes('testnet')) return 'testnet';
    if (rpcUrl.includes('mainnet')) return 'mainnet-beta';
    return 'localnet';
}

/** Repo-local state directory for dev keypairs and the created mint address. */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const LOCAL_STATE_DIR = path.join(REPO_ROOT, '.fils-local');

export async function loadOrCreateSigner(name: string): Promise<KeyPairSigner> {
    const file = path.join(LOCAL_STATE_DIR, `${name}.json`);
    try {
        const bytes = new Uint8Array(JSON.parse(await readFile(file, 'utf8')) as number[]);
        return await createKeyPairSignerFromPrivateKeyBytes(bytes);
    } catch {
        const seed = crypto.getRandomValues(new Uint8Array(32));
        await mkdir(LOCAL_STATE_DIR, { recursive: true });
        await writeFile(file, JSON.stringify([...seed]));
        return await createKeyPairSignerFromPrivateKeyBytes(seed);
    }
}

export interface DaedMintState {
    mint: string;
    cluster: string;
    createdAt: string;
}

export async function saveDaedMintState(state: DaedMintState): Promise<void> {
    await mkdir(LOCAL_STATE_DIR, { recursive: true });
    await writeFile(path.join(LOCAL_STATE_DIR, 'daed.json'), JSON.stringify(state, null, 2));
}

export async function loadDaedMintState(): Promise<DaedMintState | undefined> {
    try {
        return JSON.parse(await readFile(path.join(LOCAL_STATE_DIR, 'daed.json'), 'utf8')) as DaedMintState;
    } catch {
        return undefined;
    }
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

