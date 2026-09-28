const trackingKeys = new Set([
  "s", "t", "ref", "ref_src", "fbclid", "gclid", "dclid", "gbraid", "wbraid",
  "msclkid", "twclid", "ttclid", "yclid", "si", "igsh", "igshid",
  "mc_cid", "mc_eid", "_hsenc", "_hsmi", "mkt_tok", "vero_id"
]);

export function normalizePageUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (trackingKeys.has(lower) || lower.startsWith("utm_") || lower.startsWith("hsa_")) {
        url.searchParams.delete(key);
      }
    }
    return url.href;
  } catch {
    // Retain corrupt legacy URLs as distinct, stable threads rather than losing their saves.
    return `\u0000invalid:${encodeURIComponent(raw)}`;
  }
}
