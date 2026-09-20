import type { CityProperty } from "./city.ts";
export type MarketPlace = {
  logo?: string;
  billboard?: string;
  billboardCrop?: { x: number; y: number; zoom: number };
  id: string;
  slug: string;
  name: string;
  color: string;
  rank: number;
  value: number;
  x: number;
  z: number;
  tier: number;
};
export type MarketMove = {
  id: string;
  before: MarketPlace | null;
  after: MarketPlace | null;
};
export type MarketEvent = {
  revision: number;
  version: number;
  cause: "purchase" | "correction";
  initiator: string | null;
  created_at: string;
  moves: MarketMove[];
};
export type CityMarket = {
  revision: number;
  top: CityProperty[];
  events: MarketEvent[];
};
export type CityQuote = {
  leader?: { id: string; name: string; value: number } | null;
  revision: number;
  quotedAt: string;
  businessId: string;
  amount: number;
  currentRank: number | null;
  currentValue: number;
  newValue: number;
  rank: number;
  tier: number;
  currentTier: number;
  from: { x: number; z: number } | null;
  to: { x: number; z: number } | null;
  targets: { rank: number; amount: number; available: boolean }[];
  overtaken: { name: string; rank: number }[];
};
/** One root pose for architecture AND every attached sign. Three seconds, deterministic. */
export function marketMotion(move: MarketMove, elapsed: number) {
  const to = move.after,
    from = move.before || to;
  if (!to || !from) return null;
  const t = Math.max(0, Math.min(1, elapsed / 3000));
  const travel = Math.max(0, Math.min(1, (t - 0.2) / 0.55));
  const eased = travel * travel * (3 - 2 * travel);
  return {
    x: from.x + (to.x - from.x) * eased,
    z: from.z + (to.z - from.z) * eased,
    lift: Math.sin(Math.PI * t) * 6,
    scale: move.before?.tier !== to.tier
      ? Math.max(0.05, Math.min(1, t * 4))
      : 1,
    turn: eased,
    done: t === 1,
  };
}
export function marketHeadline(event: MarketEvent) {
  const actor = event.moves.find((m) => m.id === event.initiator),
    p = actor?.after;
  if (event.cause !== "purchase") return "City positions updated";
  if (p?.rank === 1 && actor?.before?.rank !== 1) {
    return `${p.name} took Central Plaza`;
  }
  if (p && p.rank <= 10 && (actor?.before?.rank ?? Infinity) > 10) {
    return `${p.name} entered the Top 10`;
  }
  if (p && actor?.before && p.tier > actor.before.tier) {
    return `${p.name} upgraded its property`;
  }
  return p ? `${p.name} increased City Value` : "City positions updated";
}
