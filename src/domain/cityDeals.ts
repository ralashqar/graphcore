export type DealTerms = {
  title: string;
  description: string;
  image: string;
  kind: "percentage" | "fixed" | "free_product" | "trial_access";
  value: number;
  currency: string;
  minimumSpend: number;
  maximumDiscount: number | null;
  destination: string;
  startsAt: string;
  endsAt: string;
  redeemBy: string | null;
  exclusive: boolean;
  merchantExpiryConfirmed: boolean;
};
export type CityDeal = {
  id: string;
  business_id: string;
  terms: DealTerms;
  status: string;
  paused: boolean;
  ended: boolean;
  version: number;
  quantity: number;
  issued: number;
  review_note: string;
  business_name?: string;
  imageUrl?: string;
  opens?: number;
  clicks?: number;
  reported?: number;
};
export type DealClaim = {
  id: string;
  deal_id: string;
  terms: DealTerms;
  code: string;
  business_name: string;
  created_at: string;
  redeemed_at: string | null;
  cancelled: boolean;
  merchant_order_id?: string;
};
export function dealAvailability(d: CityDeal, now = Date.now()) {
  if (d.status !== "approved") return d.status;
  if (d.ended || now >= Date.parse(d.terms.endsAt)) return "ended";
  if (d.paused) return "paused";
  if (now < Date.parse(d.terms.startsAt)) return "scheduled";
  return d.issued >= d.quantity ? "sold out" : "live";
}
export function claimState(c: DealClaim, now = Date.now()) {
  return c.cancelled
    ? "cancelled"
    : c.redeemed_at
    ? "used"
    : c.terms.redeemBy && now >= Date.parse(c.terms.redeemBy)
    ? "expired"
    : "active";
}
// A deliberately narrow one-column CSV format; quoted commas and doubled quotes are supported.
export function parseDealCodes(text: string): string[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) =>
    l.trim()
  );
  if (lines[0]?.trim().toLowerCase() === "code") lines.shift();
  const codes = lines.map((line) => {
    const s = line.trim();
    if (s.startsWith('"')) {
      if (!/^"(?:[^"]|"")*"$/.test(s)) {
        throw new Error("Use one code per row in a single code column.");
      }
      return s.slice(1, -1).replaceAll('""', '"').trim();
    }
    if (s.includes(",") || s.includes('"')) {
      throw new Error(
        "Use a single code column; quote codes containing commas.",
      );
    }
    return s;
  });
  if (
    !codes.length || codes.length > 1000 ||
    codes.some((c) => !c || c.length > 200 || /[\x00-\x1f]/.test(c))
  ) throw new Error("Import 1–1000 codes, each up to 200 characters.");
  if (new Set(codes).size !== codes.length) {
    throw new Error("Duplicate codes in this import. Nothing was uploaded.");
  }
  return codes;
}
