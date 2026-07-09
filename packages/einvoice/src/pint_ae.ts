/**
 * FilsReceipt → PINT AE (Peppol UBL) invoice XML.
 *
 * The UAE e-invoicing mandate (Ministerial Decisions 243/244 of 2025) phases
 * in from the July 2026 pilot to mandatory waves in 2027, exchanging PINT AE
 * XML through Accredited Service Providers on a Peppol 5-corner model. A
 * Solana-settled sale is still a sale: this module lifts a Fils receipt into
 * a PINT-AE-shaped UBL invoice so a merchant's ASP can ingest it like any
 * other, with the on-chain proof carried as payment evidence.
 *
 * Scope honesty: this produces a structurally faithful draft (UBL 2.1,
 * PINT AE customization, AED, 5% VAT category S, TIN-derived endpoints).
 * Field-complete validation against the Ministry's data dictionary is the
 * ASP's job — always validate with your ASP before relying on it.
 */
import { FilsError, vatBreakdownFromGross, type FilsReceipt } from '@fils/core';

export interface PintAeParty {
    /** Registered legal name. */
    name: string;
    /** 15-digit UAE Tax Registration Number, when VAT-registered. */
    trn?: string;
    address: {
        streetName: string;
        cityName: string;
        /** Emirate, e.g. "Dubai" — PINT AE carries it as CountrySubentity. */
        emirate: string;
        countryCode?: 'AE';
    };
}

export interface ReceiptToPintAeInput {
    receipt: FilsReceipt;
    supplier: PintAeParty;
    /** Omit for a simplified (B2C) invoice shape. */
    customer?: PintAeParty;
    note?: string;
}

const VAT_RATE_BPS = 500n;

export function receiptToPintAeXml(input: ReceiptToPintAeInput): string {
    const { receipt, supplier } = input;
    if (receipt.currency !== 'AED') {
        throw new FilsError('INVALID_AMOUNT', `PINT AE invoices are AED-denominated; got ${receipt.currency}`);
    }
    if (BigInt(receipt.totals.vatBps) !== VAT_RATE_BPS) {
        throw new FilsError(
            'INVALID_AMOUNT',
            `expected the UAE standard 5% VAT rate (500 bps); got ${receipt.totals.vatBps}`,
        );
    }
    if (
        receipt.seller.trn !== undefined &&
        receipt.seller.trn !== '' &&
        supplier.trn !== undefined &&
        receipt.seller.trn !== supplier.trn
    ) {
        throw new FilsError(
            'INCONSISTENT_INPUT',
            `receipt seller TRN (${receipt.seller.trn}) disagrees with supplier TRN (${supplier.trn})`,
        );
    }

    // Do not trust the serialized totals: recompute gross from the lines and
    // the net/VAT split from gross, and reject any receipt that does not
    // reconcile. A hand-crafted or tampered receipt cannot smuggle negative
    // lines or a mismatched taxable/payable amount into the invoice.
    const { grossFils, netFils, vatFils } = assertReceiptTotalsConsistent(receipt);
    const lines = reconcileLineNets(receipt, netFils);

    const issueDate = receipt.issuedAt.slice(0, 10);
    const paymentNote =
        `Settled on Solana (${receipt.payment.cluster}): signature ${receipt.payment.signature}; ` +
        `mint ${receipt.payment.mint}; reference ${receipt.payment.reference}`;

    const xml: string[] = [];
    xml.push('<?xml version="1.0" encoding="UTF-8"?>');
    xml.push(
        '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"' +
            ' xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"' +
            ' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
    );
    xml.push(element('cbc:CustomizationID', 'urn:peppol:pint:billing-1@ae-1'));
    xml.push(element('cbc:ProfileID', 'urn:peppol:bis:billing'));
    xml.push(element('cbc:ID', receipt.receiptNumber));
    xml.push(element('cbc:IssueDate', issueDate));
    // 380 = commercial invoice
    xml.push(element('cbc:InvoiceTypeCode', '380'));
    if (input.note !== undefined) xml.push(element('cbc:Note', input.note));
    xml.push(element('cbc:Note', paymentNote));
    xml.push(element('cbc:DocumentCurrencyCode', 'AED'));

    xml.push('<cac:AccountingSupplierParty>', party(supplier), '</cac:AccountingSupplierParty>');
    if (input.customer) {
        xml.push('<cac:AccountingCustomerParty>', party(input.customer), '</cac:AccountingCustomerParty>');
    }

    // Payment evidence: 30 = credit transfer (closest standard means for an
    // on-chain transfer); PaymentID carries the transaction signature.
    xml.push('<cac:PaymentMeans>');
    xml.push(element('cbc:PaymentMeansCode', '30'));
    xml.push(element('cbc:PaymentID', receipt.payment.signature));
    xml.push('</cac:PaymentMeans>');

    xml.push('<cac:TaxTotal>');
    xml.push(amountElement('cbc:TaxAmount', vatFils));
    xml.push('<cac:TaxSubtotal>');
    xml.push(amountElement('cbc:TaxableAmount', netFils));
    xml.push(amountElement('cbc:TaxAmount', vatFils));
    xml.push('<cac:TaxCategory>');
    xml.push(element('cbc:ID', 'S'));
    xml.push(element('cbc:Percent', '5'));
    xml.push('<cac:TaxScheme>', element('cbc:ID', 'VAT'), '</cac:TaxScheme>');
    xml.push('</cac:TaxCategory>');
    xml.push('</cac:TaxSubtotal>');
    xml.push('</cac:TaxTotal>');

    xml.push('<cac:LegalMonetaryTotal>');
    xml.push(amountElement('cbc:LineExtensionAmount', netFils));
    xml.push(amountElement('cbc:TaxExclusiveAmount', netFils));
    xml.push(amountElement('cbc:TaxInclusiveAmount', grossFils));
    xml.push(amountElement('cbc:PayableAmount', grossFils));
    xml.push('</cac:LegalMonetaryTotal>');

    lines.forEach((line, index) => {
        xml.push('<cac:InvoiceLine>');
        xml.push(element('cbc:ID', String(index + 1)));
        xml.push(`<cbc:InvoicedQuantity unitCode="C62">${line.quantity}</cbc:InvoicedQuantity>`);
        xml.push(amountElement('cbc:LineExtensionAmount', line.netFils));
        xml.push('<cac:Item>');
        xml.push(element('cbc:Name', line.description));
        xml.push('<cac:ClassifiedTaxCategory>');
        xml.push(element('cbc:ID', 'S'));
        xml.push(element('cbc:Percent', '5'));
        xml.push('<cac:TaxScheme>', element('cbc:ID', 'VAT'), '</cac:TaxScheme>');
        xml.push('</cac:ClassifiedTaxCategory>');
        xml.push('</cac:Item>');
        xml.push('<cac:Price>');
        xml.push(amountElement('cbc:PriceAmount', line.unitNetFils, 4));
        xml.push('</cac:Price>');
        xml.push('</cac:InvoiceLine>');
    });

    xml.push('</Invoice>');
    return xml.join('\n');
}

/** Parse a non-negative integer fils string, rejecting anything else. */
function parseFils(value: string, field: string): bigint {
    if (!/^\d+$/.test(value)) {
        throw new FilsError('INCONSISTENT_INPUT', `${field} is not a non-negative fils integer: "${value}"`);
    }
    return BigInt(value);
}

/**
 * Recompute the invoice totals from the receipt's own lines and reject the
 * receipt if the serialized totals do not match. Guards against negative or
 * inconsistent line amounts and a gross/net/VAT split that was tampered with
 * after `buildReceipt` produced it.
 */
function assertReceiptTotalsConsistent(receipt: FilsReceipt): {
    grossFils: bigint;
    netFils: bigint;
    vatFils: bigint;
} {
    const grossFils = parseFils(receipt.totals.grossFils, 'totals.grossFils');
    const netFils = parseFils(receipt.totals.netFils, 'totals.netFils');
    const vatFils = parseFils(receipt.totals.vatFils, 'totals.vatFils');

    let lineSum = 0n;
    for (const line of receipt.lines) {
        if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
            throw new FilsError('INCONSISTENT_INPUT', `line "${line.description}" has invalid quantity ${line.quantity}`);
        }
        const unit = parseFils(line.unitFils, `line "${line.description}" unitFils`);
        const total = parseFils(line.totalFils, `line "${line.description}" totalFils`);
        if (total !== unit * BigInt(line.quantity)) {
            throw new FilsError(
                'INCONSISTENT_INPUT',
                `line "${line.description}" total ${total} does not equal unit ${unit} × qty ${line.quantity}`,
            );
        }
        lineSum += total;
    }
    if (lineSum !== grossFils) {
        throw new FilsError('INCONSISTENT_INPUT', `line totals (${lineSum}) do not sum to gross (${grossFils})`);
    }
    if (grossFils <= 0n) {
        throw new FilsError('INVALID_AMOUNT', 'invoice gross total must be positive');
    }
    const expected = vatBreakdownFromGross(grossFils, VAT_RATE_BPS);
    if (netFils !== expected.netFils || vatFils !== expected.vatFils) {
        throw new FilsError(
            'INCONSISTENT_INPUT',
            `receipt VAT breakdown (net ${netFils}, VAT ${vatFils}) does not reconcile with gross ${grossFils}`,
        );
    }
    return { grossFils, netFils, vatFils };
}

interface ReconciledLine {
    description: string;
    quantity: number;
    /** Net (VAT-exclusive) line total in fils; sums exactly to the document net. */
    netFils: bigint;
    /** Net unit price in hundredths of a fils (4 decimal places of AED). */
    unitNetFils: bigint;
}

/**
 * Receipt lines are VAT-inclusive (UAE retail); UBL lines are net. Per-line
 * gross→net conversion rounds, so the per-line nets are adjusted (largest
 * line absorbs the remainder) to sum **exactly** to the document-level net —
 * the authoritative figure the VAT breakdown was computed from.
 */
function reconcileLineNets(receipt: FilsReceipt, documentNetFils: bigint): ReconciledLine[] {
    const divisor = 10_000n + VAT_RATE_BPS;
    const lines = receipt.lines.map(line => {
        const gross = BigInt(line.totalFils);
        return {
            description: line.description,
            quantity: line.quantity,
            netFils: (gross * 10_000n + divisor / 2n) / divisor,
        };
    });
    const sum = lines.reduce((total, line) => total + line.netFils, 0n);
    const remainder = documentNetFils - sum;
    if (remainder !== 0n && lines.length > 0) {
        const largest = lines.reduce((a, b) => (b.netFils > a.netFils ? b : a));
        largest.netFils += remainder;
    }
    return lines.map(line => ({
        ...line,
        // Unit price at 4dp of AED (hundredths of a fils) so qty × price
        // stays close to the line net without floating point.
        unitNetFils: (line.netFils * 100n + BigInt(line.quantity) / 2n) / BigInt(line.quantity),
    }));
}

function party(info: PintAeParty): string {
    const parts: string[] = ['<cac:Party>'];
    if (info.trn !== undefined) {
        // Peppol participant id: 0235 scheme, first 10 digits of the TRN (the TIN).
        const tin = info.trn.replace(/\D/g, '').slice(0, 10);
        parts.push(`<cbc:EndpointID schemeID="0235">${escapeXml(tin)}</cbc:EndpointID>`);
    }
    parts.push('<cac:PostalAddress>');
    parts.push(element('cbc:StreetName', info.address.streetName));
    parts.push(element('cbc:CityName', info.address.cityName));
    parts.push(element('cbc:CountrySubentity', info.address.emirate));
    parts.push(
        '<cac:Country>',
        element('cbc:IdentificationCode', info.address.countryCode ?? 'AE'),
        '</cac:Country>',
    );
    parts.push('</cac:PostalAddress>');
    if (info.trn !== undefined) {
        parts.push('<cac:PartyTaxScheme>');
        parts.push(element('cbc:CompanyID', info.trn));
        parts.push('<cac:TaxScheme>', element('cbc:ID', 'VAT'), '</cac:TaxScheme>');
        parts.push('</cac:PartyTaxScheme>');
    }
    parts.push('<cac:PartyLegalEntity>');
    parts.push(element('cbc:RegistrationName', info.name));
    parts.push('</cac:PartyLegalEntity>');
    parts.push('</cac:Party>');
    return parts.join('\n');
}

function element(tag: string, text: string): string {
    return `<${tag}>${escapeXml(text)}</${tag}>`;
}

/** Fils (or sub-fils) → fixed-decimal AED amount element with currencyID. */
function amountElement(tag: string, value: bigint, decimals: 2 | 4 = 2): string {
    return `<${tag} currencyID="AED">${fixedDecimal(value, decimals)}</${tag}>`;
}

function fixedDecimal(value: bigint, decimals: number): string {
    const negative = value < 0n;
    const abs = negative ? -value : value;
    const base = 10n ** BigInt(decimals);
    const whole = abs / base;
    const fraction = (abs % base).toString().padStart(decimals, '0');
    return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function escapeXml(text: string): string {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}
