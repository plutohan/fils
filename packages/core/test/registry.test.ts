import { describe, expect, it } from 'vitest';

import {
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

    it('rejects tokens that are not fils-precise (2 decimals)', () => {
        const registry = createAedTokenRegistry();
        expect(() =>
            registry.register({ ...describeDaedMint(MINT, 'devnet'), decimals: 6 }),
        ).toThrowError(FilsError);
    });
});
