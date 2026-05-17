// Minimal type shim for `geoip-country` (the package ships JS only).
// We only use `lookup(ip)`; the full surface is broader (see node_modules/
// geoip-country/lib/geoip.js).
declare module "geoip-country" {
  interface CountryLookup {
    range: [number, number];
    country: string;
  }
  function lookup(ip: string): CountryLookup | null;
  const _default: { lookup: typeof lookup };
  export default _default;
}
