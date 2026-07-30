export function onlyPhoneDigits(value) {
    return value.replace(/\D/g, '').slice(0, 13);
}
export function normalizeBrazilianPhone(value) {
    const digits = onlyPhoneDigits(value);
    const withoutCountryCode = (digits.length === 12 || digits.length === 13) && digits.startsWith('55')
        ? digits.slice(2)
        : digits;
    if (withoutCountryCode.length !== 10 && withoutCountryCode.length !== 11)
        return null;
    return withoutCountryCode;
}
export function isValidBrazilianPhone(value) {
    return normalizeBrazilianPhone(value) !== null;
}
export function formatBrazilianPhone(value) {
    const normalized = normalizeBrazilianPhone(value);
    if (!normalized)
        return value.replace(/\D/g, '') || value;
    if (normalized.length === 10) {
        return `(${normalized.slice(0, 2)}) ${normalized.slice(2, 6)}-${normalized.slice(6)}`;
    }
    return `(${normalized.slice(0, 2)}) ${normalized.slice(2, 7)}-${normalized.slice(7)}`;
}
export function maskBrazilianPhone(value) {
    const digits = onlyPhoneDigits(value);
    const displayDigits = (digits.length === 12 || digits.length === 13) && digits.startsWith('55')
        ? digits.slice(2)
        : digits;
    if (displayDigits.length <= 2)
        return displayDigits ? `(${displayDigits}` : '';
    if (displayDigits.length <= 6)
        return `(${displayDigits.slice(0, 2)}) ${displayDigits.slice(2)}`;
    if (displayDigits.length <= 10)
        return `(${displayDigits.slice(0, 2)}) ${displayDigits.slice(2, 6)}-${displayDigits.slice(6)}`;
    return `(${displayDigits.slice(0, 2)}) ${displayDigits.slice(2, 7)}-${displayDigits.slice(7)}`;
}
export function toWhatsAppPhone(value) {
    const normalized = normalizeBrazilianPhone(value);
    return normalized ? `55${normalized}` : '';
}
