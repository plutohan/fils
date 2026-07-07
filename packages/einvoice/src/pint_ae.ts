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
import { FilsError, type FilsReceipt } from '@fils/core';

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

    const grossFils = BigInt(receipt.totals.grossFils);
    const netFils = BigInt(receipt.totals.netFils);
    const vatFils = BigInt(receipt.totals.vatFils);
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
