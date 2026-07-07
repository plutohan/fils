import { FilsError } from './errors.js';

/**
 * AED amounts in this SDK are integer **fils** (`bigint`).
 * 1 AED = 100 fils, so an AED payment token uses 2 decimals on-chain and the
 * raw token amount is literally a fils count. Integer math end-to-end — no
 * floating point anywhere near money.
 */
export const AED_DECIMALS = 2;
export const FILS_PER_AED = 100n;

/**
 * Largest amount we allow through the SDK: 2^53-1 fils (~90 trillion AED).
 * Keeps `Number` interop (Intl formatting) exact.
 */
const MAX_FILS = BigInt(Number.MAX_SAFE_INTEGER);

const AED_DECIMAL_RE = /^(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parse a decimal AED string ("12", "12.5", "12.50") into fils.
 * Rejects negatives, more than 2 decimal places, and non-numeric input —
 * an AED payment token cannot represent sub-fils amounts.
 */
export function parseAed(input: string): bigint {
    const match = AED_DECIMAL_RE.exec(input.trim());
    if (!match) {
        throw new FilsError(
            'INVALID_AMOUNT',
            `"${input}" is not a valid AED amount (expected e.g. "12.50", max 2 decimal places)`,
        );
    }
    const [, whole = '0', fraction = ''] = match;
    const fils = BigInt(whole) * FILS_PER_AED + BigInt(fraction.padEnd(2, '0'));
    assertFilsInRange(fils);
    return fils;
}

/**
 * Canonical minimal decimal string for URLs and on-chain interop:
 * 1250n → "12.5", 1200n → "12", 1n → "0.01".
 * (Solana Pay `amount` values should not carry trailing zeros.)
 */
export function filsToDecimalString(fils: bigint): string {
    assertFilsInRange(fils);
    const whole = fils / FILS_PER_AED;
    const fraction = fils % FILS_PER_AED;
    if (fraction === 0n) return whole.toString();
    const fractionStr = fraction.toString().padStart(2, '0').replace(/0$/, '');
    return `${whole}.${fractionStr}`;
}

export type AedLocale = 'en' | 'ar';

const FORMATTERS: Record<AedLocale, Intl.NumberFormat> = {
    en: new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED' }),
    ar: new Intl.NumberFormat('ar-AE', { style: 'currency', currency: 'AED' }),
};

/** Human display string, localized: `formatAed(1250n, 'en')` → "AED 12.50". */
export function formatAed(fils: bigint, locale: AedLocale = 'en'): string {
    assertFilsInRange(fils);
    return FORMATTERS[locale].format(Number(fils) / Number(FILS_PER_AED));
}

/** UAE standard VAT rate, in basis points. */
export const UAE_VAT_BPS = 500n;

export interface VatBreakdown {
    /** VAT-inclusive total, as charged to the customer. */
    grossFils: bigint;
    /** Net amount excluding VAT. */
    netFils: bigint;
    /** VAT portion (gross − net). */
    vatFils: bigint;
    vatBps: bigint;
}

/**
 * Split a VAT-inclusive amount into net + VAT (UAE retail prices are
 * VAT-inclusive). Net is rounded half-up to the nearest fils; VAT is the
 * exact remainder so `net + vat === gross` always holds.
 */
export function vatBreakdownFromGross(grossFils: bigint, vatBps: bigint = UAE_VAT_BPS): VatBreakdown {
    assertFilsInRange(grossFils);
    if (vatBps < 0n) {
        throw new FilsError('INVALID_AMOUNT', 'VAT rate cannot be negative');
    }
    const divisor = 10_000n + vatBps;
    const netFils = (grossFils * 10_000n + divisor / 2n) / divisor;
    return { grossFils, netFils, vatFils: grossFils - netFils, vatBps };
}

function assertFilsInRange(fils: bigint): void {
    if (fils < 0n) {
        throw new FilsError('INVALID_AMOUNT', 'AED amounts cannot be negative');
    }
    if (fils > MAX_FILS) {
        throw new FilsError('AMOUNT_OUT_OF_RANGE', `amount of ${fils} fils exceeds the supported range`);
    }
}
