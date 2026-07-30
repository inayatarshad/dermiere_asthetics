/**
 * Phone normalization - the dedupe key for CRM contacts.
 *
 * Pakistani numbers arrive in every shape a human can type: 0300 1234567,
 * +92 300 1234567, 92-300-1234567, 03001234567. They are all one person, so
 * they must all collapse to one key or the same lead lands in the pipeline
 * three times.
 *
 * Output is digits-only with a country code and no "+", e.g. 923001234567.
 * Anything we cannot confidently interpret is returned digits-only rather
 * than mangled - a wrong-but-stable key still dedupes exact repeats.
 */

const DEFAULT_COUNTRY = "92"; // Pakistan

export function normalizePhone(
  raw: string | undefined | null,
  country: string = DEFAULT_COUNTRY
): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const hadPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";

  // 00-prefixed international dialling is just "+" spelled out.
  if (!hadPlus && digits.startsWith("00")) digits = digits.slice(2);
  else if (hadPlus) {
    // already international; nothing to prepend
    return digits;
  }

  // National trunk form: 0300... -> 92300...
  if (digits.startsWith("0")) return country + digits.replace(/^0+/, "");

  // Already carries the country code.
  if (digits.startsWith(country)) return digits;

  // A bare national subscriber number (3001234567) - 10 digits for PK.
  if (digits.length === 10) return country + digits;

  return digits;
}

/** Pretty form for display: +92 300 1234567. Falls back to the raw input. */
export function formatPhone(raw: string | undefined | null): string {
  const n = normalizePhone(raw);
  if (!n) return raw ?? "";
  if (n.startsWith("92") && n.length === 12) {
    return `+92 ${n.slice(2, 5)} ${n.slice(5)}`;
  }
  return `+${n}`;
}

/**
 * Does a stored `phone_norm` match what someone typed into a search box?
 *
 * Search queries are partial numbers, and staff type them the local way
 * ("0345 998…"). Stored keys are international ("923459988776"), so a raw
 * substring test silently fails on exactly the form people use most. Both
 * the typed digits and their normalized form are tried.
 *
 * Returns false for very short queries: one or two digits match most of the
 * list and make the results look broken.
 */
export function phoneMatchesQuery(phoneNorm: string, query: string): boolean {
  const digits = query.replace(/\D/g, "");
  if (digits.length < 3 || !phoneNorm) return false;
  if (phoneNorm.includes(digits)) return true;
  const normalized = normalizePhone(digits);
  return !!normalized && phoneNorm.includes(normalized);
}

/** True when two numbers belong to the same person. */
export function samePhone(a: string, b: string): boolean {
  const na = normalizePhone(a);
  return !!na && na === normalizePhone(b);
}

export function isPlausiblePhone(raw: string | undefined | null): boolean {
  const n = normalizePhone(raw);
  return n.length >= 10 && n.length <= 15;
}
