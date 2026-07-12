import { describe, expect, it } from 'vitest';

import {
    DAED_DEVNET_MINT,
    FilsError,
    TOKEN_2022_PROGRAM_ADDRESS,
    createAedTokenRegistry,
    describeDaedMint,
} from '../src/index.js';

const MINT = 'So11111111111111111111111111111111111111112';

describe('AedTokenRegistry', () => {
    it('registers and looks up tokens by mint and cluster', () => {
        const registry = createAedTokenRegistry([describeDaedMint(MINT, 'localnet')]);
        const found = registry.byMint(MINT);
        expect(found?.symbol).toBe('dAED');
        expect(found?.tokenProgram).toBe(TOKEN_2022_PROGRAM_ADDRESS);
        expect(registry.forCluster('localnet')).toHaveLength(1);
        expect(registry.forCluster('mainnet-beta')).toHaveLength(0);
    });

    it('ships the devnet dAED reference mint by default', () => {
        const registry = createAedTokenRegistry();
        const dAed = registry.byMint(DAED_DEVNET_MINT);
        expect(dAed?.symbol).toBe('dAED');
        expect(dAed?.cluster).toBe('devnet');
        expect(registry.forCluster('devnet')).toHaveLength(1);
    });

    it('rejects tokens that are not fils-precise (2 decimals)', () => {
        const registry = createAedTokenRegistry();
        expect(() =>
            registry.register({ ...describeDaedMint(MINT, 'devnet'), decimals: 6 }),
        ).toThrowError(FilsError);
    });
});
