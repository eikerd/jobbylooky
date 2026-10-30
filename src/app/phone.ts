/**
 * A caller ID as its 10 NANP digits, or '' when it is not one: an explicit country code other
 * than +1 ("+45 20123456") must not be read as a US number, or a click dials a stranger.
 * Same test as the server's normalizeNumber, which matches voicemails to pitches.
 */
export function nanpDigits(value: string): string {
  if (value.trim().startsWith('+') && !/^\+1\d{10}$/.test(value.replace(/[^\d+]/g, ''))) return '';
  const digits = value.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return /^[2-9]\d{9}$/.test(ten) ? ten : '';
}

/** "+15028900699" → "(502) 890-0699"; anything else as stored. */
export function phoneText(value: string): string {
  const ten = nanpDigits(value);
  return ten ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : value || 'Unknown caller';
}

/** "+15028900699" → "tel:+15028900699", which the Mac hands to FaceTime / iPhone; '' when there is no number to dial. */
export function telHref(value: string): string {
  const ten = nanpDigits(value);
  return ten ? `tel:+1${ten}` : '';
}
