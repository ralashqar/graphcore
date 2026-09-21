/** Synarc City contracts. Money is always integer GBP pennies. */
export const CITY_MIN_PURCHASE = 1_000;
export const CITY_MAX_PURCHASE = 5_000_000;
export const CITY_TIERS = [
  { name: "Kiosk", minimum: 1_000, height: 1.1 },
  { name: "Shop", minimum: 10_000, height: 1.8 },
  { name: "Store", minimum: 50_000, height: 2.8 },
  { name: "Building", minimum: 200_000, height: 4.5 },
  { name: "Tower", minimum: 1_000_000, height: 7 },
  { name: "Landmark", minimum: 5_000_000, height: 10 },
] as const;

export type CityProfile = {
  buildingArt?: string;
  campus?: import("./cityCampus.ts").CityCampus | null;
  name: string;
  tagline: string;
  description: string;
  website: string;
  category: string;
  color: string;
  logo: string;
  hero: string;
  billboard?: string;
  billboardCrop?: { x: number; y: number; zoom: number };
  sample?: import('./cityDiscovery.ts').CitySample | null;
  video: string;
  offer: {
    title: string;
    description: string;
    code: string;
    expiresAt: string | null;
    url: string;
  };
};
export type CityProperty = {
  hasDeal?: boolean;
  id: string;
  slug: string;
  profile: CityProfile;
  landValue: number;
  rank: number;
  x: number;
  z: number;
  tier: number;
  saves: number;
  claims: number;
};
export type CityEvent = {
  id: string;
  businessId: string;
  name: string;
  kind: string;
  fromRank: number | null;
  toRank: number;
  createdAt: string;
};
export type CitySnapshot = {
  revision: number;
  capacity: number;
  total: number;
  properties: CityProperty[];
  events: CityEvent[];
  purchasesEnabled: boolean;
  onboardingEnabled: boolean;
  discoveryEnabled?: boolean;
  campusEnabled?: boolean;
  dealsEnabled?: boolean;
  customerDiscoveryEnabled?: boolean;
  setupEnabled?: boolean;
  marketEnabled?: boolean;
  exposureEnabled?: boolean;
  storefrontsEnabled?: boolean;
  activityEnabled?: boolean;
  launchesEnabled?: boolean;
  launchPlazaEnabled?: boolean;
  termsUrl?: string | null;
  demo?: boolean;
};
export type CityBusiness = {
  id: string;
  slug: string;
  draft: CityProfile;
  published: CityProfile | null;
  status: "draft" | "pending" | "approved" | "rejected" | "suspended";
  verified_at: string | null;
  verification_token: string;
  review_note: string | null;
  land_value: number;
  draft_version: number;
  submitted_version: number | null;
  preview?: CityProfile;
};
export type CityOrder = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  checkout_url: string | null;
};
export type CityWorkspace = {
  business: CityBusiness | null;
  orders: CityOrder[];
  saved: string[];
  claims: {
    business_id: string;
    created_at: string;
    business_name: string;
    offer: CityProfile["offer"];
  }[];
  analytics: Record<string, number>;
  history: CityEvent[];
  admin: boolean;
};
export const emptyCityProfile = (): CityProfile => ({
  name: "",
  tagline: "",
  description: "",
  website: "",
  category: "Shopping",
  color: "#547364",
  logo: "",
  hero: "",
  video: "",
  offer: { title: "", description: "", code: "", expiresAt: null, url: "" },
});
export function buildingTier(value: number) {
  let tier = 0;
  for (let i = 0; i < CITY_TIERS.length; i++)
    if (value >= CITY_TIERS[i].minimum) tier = i;
  return tier;
}
export const formatGBP = (pennies: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: pennies % 100 ? 2 : 0,
  }).format(pennies / 100);
export function parsePurchase(pounds: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(pounds))
    throw new Error(
      "Enter an amount in pounds, with up to two decimal places.",
    );
  const [whole, fraction = ""] = pounds.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (
    !Number.isSafeInteger(amount) ||
    amount < CITY_MIN_PURCHASE ||
    amount > CITY_MAX_PURCHASE
  )
    throw new Error("Purchases must be between £10 and £50,000.");
  return amount;
}
export function cityPlots(minimum = 400) {
  // Initial 20 x 20 saleable sites, split by a plaza/avenue at the origin.
  const plots: { priority: number; x: number; z: number }[] = [];
  const append = (radius: number, first: boolean) => {
    const ring: { x: number; z: number }[] = [];
    for (let x = -radius; x <= radius; x++)
      for (let z = -radius; z <= radius; z++) {
        if (
          !x ||
          !z ||
          (!first && Math.max(Math.abs(x), Math.abs(z)) !== radius)
        )
          continue;
        ring.push({ x, z });
      }
    ring.sort(
      (a, b) =>
        a.x * a.x + a.z * a.z - b.x * b.x - b.z * b.z || a.x - b.x || a.z - b.z,
    );
    for (const plot of ring)
      plots.push({ priority: plots.length + 1, ...plot });
  };
  append(10, true);
  for (let radius = 11; plots.length < minimum; radius++) append(radius, false);
  return plots;
}
export function rankBusinesses<
  T extends { id: string; landValue: number; reachedAt: string },
>(businesses: T[]) {
  return [...businesses]
    .filter((b) => b.landValue > 0)
    .sort(
      (a, b) =>
        b.landValue - a.landValue ||
        Date.parse(a.reachedAt) - Date.parse(b.reachedAt) ||
        a.id.localeCompare(b.id),
    );
}
export function activeOffer(profile: CityProfile, now = Date.now()) {
  return (
    !!profile.offer.title &&
    (!profile.offer.expiresAt || Date.parse(profile.offer.expiresAt) > now)
  );
}
export function safeWebsite(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error(
      "Use a public HTTPS website without credentials or a custom port.",
    );
  return url.toString();
}
