/**
 * The café menu — the single source of truth for prices. The checkout API
 * recomputes totals from this table; client-supplied prices are never
 * trusted.
 */
export interface MenuItem {
    readonly id: string;
    readonly emoji: string;
    readonly nameEn: string;
    readonly nameAr: string;
    /** VAT-inclusive unit price in fils (1 AED = 100 fils). */
    readonly unitFils: bigint;
}

export const MENU: readonly MenuItem[] = [
    { id: 'karak', emoji: '🫖', nameEn: 'Karak chai', nameAr: 'شاي كرك', unitFils: 150n },
    { id: 'gahwa', emoji: '☕', nameEn: 'Emirati gahwa', nameAr: 'قهوة عربية', unitFils: 700n },
    { id: 'camel-latte', emoji: '🐪', nameEn: 'Camel-milk latte', nameAr: 'لاتيه بحليب الإبل', unitFils: 2200n },
    { id: 'luqaimat', emoji: '🍯', nameEn: 'Luqaimat', nameAr: 'لقيمات', unitFils: 800n },
    { id: 'date-cake', emoji: '🌴', nameEn: 'Date cake', nameAr: 'كيكة التمر', unitFils: 1450n },
    { id: 'saffron-cake', emoji: '🍰', nameEn: 'Saffron milk cake', nameAr: 'كيكة الزعفران بالحليب', unitFils: 1800n },
];

export function menuItem(id: string): MenuItem | undefined {
    return MENU.find(item => item.id === id);
}
