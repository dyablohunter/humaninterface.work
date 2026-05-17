/**
 * API wire-format helpers for timestamps.
 *
 * Every API response and every server -> client component prop boundary must
 * use Unix milliseconds (number) for date/time values. Database columns stay
 * as Prisma `DateTime` (PostgreSQL timestamp); this helper is the conversion
 * point on the way out.
 *
 *   toUnix(date)        // 1779023134412
 *   toUnix(null)        // null
 *   toUnix(undefined)   // null
 *
 * For inputs from external clients (HTTP bodies / query strings), the zod
 * schemas in `validation-tasks.ts` accept `z.number().int().min(0)` and call
 * `new Date(ms)` server-side before persisting.
 */
export function toUnix(d: Date | null | undefined): number | null {
  if (d == null) return null;
  return d.getTime();
}
