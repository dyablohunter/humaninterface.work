/**
 * ISO 3166-1 alpha-2 country list used by the task location filters.
 *
 * The codes are hard-coded (stable, audited). Display names are resolved via
 * `Intl.DisplayNames` at module load - this avoids vendoring a ~250-entry
 * name table that would drift out of date.
 *
 * Empty country = remote / location-agnostic.
 */

/** ISO 3166-1 alpha-2 codes. */
const ISO_ALPHA2: readonly string[] = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BV","BW","BY","BZ",
  "CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN","CO","CR","CU","CV","CW","CX","CY","CZ",
  "DE","DJ","DK","DM","DO","DZ",
  "EC","EE","EG","EH","ER","ES","ET",
  "FI","FJ","FK","FM","FO","FR",
  "GA","GB","GD","GE","GF","GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY",
  "HK","HM","HN","HR","HT","HU",
  "ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT",
  "JE","JM","JO","JP",
  "KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ",
  "LA","LB","LC","LI","LK","LR","LS","LT","LU","LV","LY",
  "MA","MC","MD","ME","MF","MG","MH","MK","ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ",
  "NA","NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ",
  "OM",
  "PA","PE","PF","PG","PH","PK","PL","PM","PN","PR","PS","PT","PW","PY",
  "QA",
  "RE","RO","RS","RU","RW",
  "SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST","SV","SX","SY","SZ",
  "TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ",
  "UA","UG","UM","US","UY","UZ",
  "VA","VC","VE","VG","VI","VN","VU",
  "WF","WS",
  "XK", // Kosovo (user-assigned but widely used)
  "YE","YT",
  "ZA","ZM","ZW",
];

const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

function resolveName(code: string): string {
  try {
    const name = REGION_NAMES.of(code);
    return name || code;
  } catch {
    return code;
  }
}

/** All countries, sorted by display name ascending. */
export const COUNTRIES: { code: string; name: string }[] = ISO_ALPHA2
  .map((code) => ({ code, name: resolveName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Fast-lookup set of valid ISO alpha-2 codes (uppercase). */
export const COUNTRY_CODES: Set<string> = new Set(ISO_ALPHA2);

/** True iff `code` is a known ISO 3166-1 alpha-2 country code (case-sensitive, uppercase). */
export function isValidCountryCode(code: string): boolean {
  return COUNTRY_CODES.has(code);
}

/** Display name for a country code, or null if absent / unknown. */
export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  const up = code.toUpperCase();
  if (!COUNTRY_CODES.has(up)) return null;
  return resolveName(up);
}

/** Sentinel value used in URL query params to filter for remote / no-location tasks. */
export const REMOTE_SENTINEL = "REMOTE";
