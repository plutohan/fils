import { describe, expect, it } from 'vitest';

import {
    FilsError,
    filsToDecimalString,
    formatAed,
    parseAed,
    vatBreakdownFromGross,
} from '../src/index.js';

describe('parseAed', () => {
    it('parses whole, one-decimal and two-decimal amounts to fils', () => {
        expect(parseAed('12')).toBe(1200n);
        expect(parseAed('12.5')).toBe(1250n);
        expect(parseAed('12.50')).toBe(1250n);
        expect(parseAed('0.01')).toBe(1n);
        expect(parseAed('0')).toBe(0n);
    });

    it('rejects sub-fils precision, negatives and junk', () => {
        for (const bad of ['12.505', '-3', '1,5', 'abc', '', '1.2.3', '١٢']) {
            expect(() => parseAed(bad), bad).toThrowError(FilsError);
        }
    });
});

describe('filsToDecimalString', () => {
    it('produces minimal decimal strings', () => {
        expect(filsToDecimalString(1200n)).toBe('12');
        expect(filsToDecimalString(1250n)).toBe('12.5');
        expect(filsToDecimalString(1255n)).toBe('12.55');
        expect(filsToDecimalString(1n)).toBe('0.01');
        expect(filsToDecimalString(0n)).toBe('0');
    });

    it('round-trips with parseAed', () => {
        for (const fils of [0n, 1n, 99n, 100n, 12345n, 999999999n]) {
            expect(parseAed(filsToDecimalString(fils))).toBe(fils);
        }
    });
});

describe('formatAed', () => {
    it('formats English with the AED currency', () => {
        const formatted = formatAed(1250n, 'en');
        expect(formatted).toContain('12.50');
        expect(formatted).toMatch(/AED|د\.إ/u);
    });

    it('formats Arabic with the dirham sign', () => {
        const formatted = formatAed(1250n, 'ar');
        // ar-AE uses Arabic-Indic digits and the د.إ currency sign.
        expect(formatted).toMatch(/د\.إ/u);
        expect(formatted).not.toBe(formatAed(1250n, 'en'));
    });
});

describe('vatBreakdownFromGross', () => {
    it('splits a VAT-inclusive amount at the UAE 5% rate', () => {
        // AED 105.00 gross → AED 100.00 net + AED 5.00 VAT
        const breakdown = vatBreakdownFromGross(10500n);
        expect(breakdown.netFils).toBe(10000n);
        expect(breakdown.vatFils).toBe(500n);
    });

    it('always reconciles: net + vat === gross', () => {
        for (const gross of [1n, 2n, 3n, 99n, 101n, 12345n, 99999n]) {
            const { netFils, vatFils, grossFils } = vatBreakdownFromGross(gross);
            expect(netFils + vatFils).toBe(grossFils);
            expect(vatFils >= 0n).toBe(true);
        }
    });
});
