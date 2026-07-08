import { address, generateKeyPairSigner } from '@solana/kit';
import { describe, expect, it } from 'vitest';
import { FilsError, TOKEN_PROGRAM_ADDRESS, type AedPaymentRequest, type AedTokenInfo } from '@fils/core';

import { payAedRequest } from '../src/ops.js';
import type { DaedRpc } from '../src/tx.js';

const MINT = address('So11111111111111111111111111111111111111112');
const MERCHANT = address('J7t2yiWmYA8Ka9WWSYD7Yyw7tCUnQx3F9nUV5S2Wrooj');
const REFERENCE = address('SysvarC1ock11111111111111111111111111111111');

// A hypothetical AED token registered under the legacy SPL Token program.
const legacyToken: AedTokenInfo = {
    mint: MINT,
    symbol: 'legacyAED',
    name: 'Legacy SPL AED',
    decimals: 2,
    cluster: 'localnet',
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
    issuer: 'test',
    regulatoryStatus: 'reference',
};

describe('payAedRequest', () => {
    it('rejects tokens not registered under Token-2022 (would derive the wrong ATA)', async () => {
        const buyer = await generateKeyPairSigner();
        const request: AedPaymentRequest = {
            recipient: MERCHANT,
            amountFils: 1250n,
            token: legacyToken,
            reference: REFERENCE,
            url: `solana:${MERCHANT}`,
        };
        // The guard runs before any RPC use, so a stub RPC is never touched.
        await expect(payAedRequest({} as DaedRpc, buyer, request)).rejects.toBeInstanceOf(FilsError);
    });
});
