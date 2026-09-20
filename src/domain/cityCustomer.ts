export type DiscoveryFilter = "all" | "hot" | "free" | "exclusive" | "ending" | "drops";
export type CustomerItem = {
  key: string;
  business_id: string;
  slug: string;
  business_name: string;
  category: string;
  kind: "business" | "exhibit" | "deal" | "launch";
  content_id: string;
  title: string;
  description: string;
  destination: string;
  rank: number | null;
  x: number | null;
  z: number | null;
  created_at: string;
  starts_at: string | null;
  ends_at: string | null;
  remaining: number | null;
  free: boolean;
  exclusive: boolean;
  available: boolean;
  trending?: boolean;
};
export type CustomerResults = {
  matches?:string[];
  items: CustomerItem[];
  hasMore: boolean;
  categories: string[];
  now: string;
  revision: number;
};
export function discoveryLabel(
  item: CustomerItem,
  filter: DiscoveryFilter = "all",
) {
  if (filter === "hot" && item.trending) return "↗ Hot now";
  if (filter === "ending" && item.ends_at) return "◷ Ending soon";
  if (item.free) return "✦ Free";
  if (item.exclusive) return "◆ Exclusive";
  if (item.kind === "launch") return "↑ Launch";
  if (item.kind === "deal") return "✦ Deal";
  return item.kind === "exhibit" ? "▷ Try it" : "Explore";
}
export function surpriseItem(
  items: CustomerItem[],
  recent: string[],
  random = Math.random(),
) {
  const eligible = items.filter((i) =>
    i.available && !recent.includes(i.business_id)
  );
  const pool = eligible.length ? eligible : items.filter((i) => i.available);
  const weighted = pool.flatMap((i) =>
    Array.from({
      length: i.kind === "business" ? 1 : i.free || i.exclusive ? 3 : 2,
    }, () => i)
  );
  return weighted[
    Math.min(
      weighted.length - 1,
      Math.floor(Math.max(0, random) * weighted.length),
    )
  ] || null;
}

export function businessItem(p: import("./city").CityProperty): CustomerItem {
  return {
    key: "business:" + p.id,
    business_id: p.id,
    slug: p.slug,
    business_name: p.profile.name,
    category: p.profile.category,
    kind: "business",
    content_id: p.id,
    title: p.profile.name,
    description: p.profile.tagline,
    destination: "/city/business/" + p.slug,
    rank: p.rank,
    x: p.x,
    z: p.z,
    created_at: "",
    starts_at: null,
    ends_at: null,
    remaining: null,
    free: false,
    exclusive: false,
    available: true,
  };
}
