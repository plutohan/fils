export type Locale = 'en' | 'ar';

/** UI strings for the demo. Arabic copy is demo-grade (machine-assisted). */
export const STRINGS = {
    title: { en: 'Fils Café', ar: 'مقهى فلس' },
    tagline: {
        en: 'Dirham payments on Solana — settled in under a second',
        ar: 'مدفوعات بالدرهم على سولانا — تسوية في أقل من ثانية',
    },
    menu: { en: 'Menu', ar: 'القائمة' },
    add: { en: 'Add', ar: 'أضف' },
    order: { en: 'Your order', ar: 'طلبك' },
    emptyCart: { en: 'Nothing here yet — add something tasty.', ar: 'لا شيء هنا بعد — أضف شيئًا لذيذًا.' },
    total: { en: 'Total', ar: 'الإجمالي' },
    vatIncluded: { en: 'incl. 5% VAT', ar: 'شامل ضريبة القيمة المضافة 5٪' },
    pay: { en: 'Pay with Solana', ar: 'ادفع عبر سولانا' },
    scan: { en: 'Scan with a Solana Pay wallet', ar: 'امسح الرمز بمحفظة تدعم سولانا باي' },
    waiting: { en: 'Waiting for payment…', ar: 'في انتظار الدفع…' },
    simulate: { en: 'Simulate a wallet paying (dev)', ar: 'محاكاة دفع من محفظة (تجريبي)' },
    simulating: { en: 'Paying from the demo wallet…', ar: 'جارٍ الدفع من محفظة العرض…' },
    paid: { en: 'Payment confirmed', ar: 'تم تأكيد الدفع' },
    receipt: { en: 'Receipt', ar: 'الإيصال' },
    receiptNo: { en: 'Receipt no.', ar: 'رقم الإيصال' },
    seller: { en: 'Seller', ar: 'البائع' },
    trn: { en: 'TRN', ar: 'الرقم الضريبي' },
    net: { en: 'Net', ar: 'الصافي' },
    vat: { en: 'VAT (5%)', ar: 'ضريبة القيمة المضافة (5٪)' },
    onChainProof: { en: 'On-chain proof', ar: 'الإثبات على السلسلة' },
    viewOnExplorer: { en: 'View transaction on Solana Explorer', ar: 'عرض المعاملة على مستكشف سولانا' },
    newOrder: { en: 'New order', ar: 'طلب جديد' },
    cancel: { en: 'Cancel', ar: 'إلغاء' },
    setupNeeded: {
        en: 'No dAED mint found for this cluster. Run:',
        ar: 'لا توجد عملة dAED على هذه الشبكة. شغِّل:',
    },
    error: { en: 'Something went wrong', ar: 'حدث خطأ ما' },
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, locale: Locale): string {
    return STRINGS[key][locale];
}
