/**
 * Node-only dev-state helpers (`@fils/daed/node`): persisted dev keypairs and
 * the created dAED mint address, shared by the CLI scripts and the demo app.
 * Never import this from browser code.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createKeyPairSignerFromPrivateKeyBytes, type KeyPairSigner } from '@solana/kit';

/**
 * Repo-local state directory for dev keypairs and the created mint address.
 * Resolved relative to this package (packages/daed/{src,dist} → repo root),
 * so every consumer in the workspace sees the same .fils-local/.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const LOCAL_STATE_DIR = path.join(REPO_ROOT, '.fils-local');

/** Load a persisted dev signer by name, creating (and persisting) it on first use. */
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
