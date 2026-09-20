import { launchPhase } from "./cityLaunches.ts";
export type ActivityBand = "quiet" | "active" | "busy" | "very_busy";
export type StorefrontKind =
  | "quiet"
  | "ending"
  | "live_launch"
  | "free"
  | "exclusive"
  | "deal"
  | "upcoming"
  | "sold_out";
export type StorefrontContent = {
  key: string;
  kind: string;
  title: string;
  destination: string;
  starts_at: string | null;
  ends_at: string | null;
  remaining: number | null;
  free: boolean;
  exclusive: boolean;
  available: boolean;
  sold_out_at?: string | null;
};
export type LivingState = {
  businessId: string;
  band: ActivityBand;
  kind: StorefrontKind;
  primary: StorefrontContent | null;
  windowStart: string;
  measuredAt: string;
  expiresAt: string;
  version: 1;
};
export function activityBand(score: number, actors: number): ActivityBand {
  return actors < 5 || score < 5
    ? "quiet"
    : score < 20
    ? "active"
    : score < 60
    ? "busy"
    : "very_busy";
}
export function resolveStorefront(
  items: StorefrontContent[],
  now: number,
): Pick<LivingState, "kind" | "primary"> {
  const ranked = items.flatMap((item) => {
    const start = item.starts_at ? Date.parse(item.starts_at) : 0,
      end = item.ends_at ? Date.parse(item.ends_at) : Infinity;
    let kind: StorefrontKind = "quiet", order = 99, deadline = end;
    if (
      item.kind === "deal" && item.available && start <= now && end > now &&
      (item.remaining ?? 0) > 0
    ) {
      if (end - now <= 86400000) {
        kind = "ending";
        order = 0;
      } else if (item.free) {
        kind = "free";
        order = 2;
      } else if (item.exclusive) {
        kind = "exclusive";
        order = 3;
      } else {
        kind = "deal";
        order = 4;
      }
    } else if (item.kind === "launch" && item.available && end > now && launchPhase({title:item.title,description:"",startsAt:item.starts_at||"",endsAt:item.ends_at||""},now)!=="archived") {
      kind = start <= now ? "live_launch" : "upcoming";
      order = start <= now ? 1 : 5;
      deadline = start <= now ? end : start;
    } else if (
      item.kind === "deal" && item.remaining === 0 && item.sold_out_at &&
      now >= Date.parse(item.sold_out_at) &&
      now - Date.parse(item.sold_out_at) < 86400000 && end > now
    ) {
      kind = "sold_out";
      order = 6;
    }
    return order === 99 ? [] : [{ item, kind, order, deadline }];
  }).sort((a, b) =>
    a.order - b.order || a.deadline - b.deadline ||
    a.item.key.localeCompare(b.item.key)
  );
  return ranked[0]
    ? { kind: ranked[0].kind, primary: ranked[0].item }
    : { kind: "quiet", primary: null };
}
export function freshLiving(
  state: LivingState | undefined,
  now = Date.now(),
): LivingState | undefined {
  return state && Date.parse(state.expiresAt) > now ? state : undefined;
}
export const storefrontVisual: Record<
  StorefrontKind,
  { label: string; icon: string; color: string }
> = {
  quiet: { label: "Open for discovery", icon: "◇", color: "#547364" },
  ending: { label: "Ending soon", icon: "◷", color: "#ac513d" },
  live_launch: { label: "Live launch", icon: "↑", color: "#8053a1" },
  upcoming: { label: "Coming soon", icon: "◷", color: "#8053a1" },
  free: { label: "Freebie", icon: "✦", color: "#398265" },
  exclusive: { label: "City exclusive", icon: "◆", color: "#9b771c" },
  deal: { label: "City deal", icon: "◇", color: "#547364" },
  sold_out: { label: "All codes claimed", icon: "✓", color: "#66766d" },
};
export const activityLabel: Record<ActivityBand, string> = {
  quiet: "Quiet",
  active: "Active",
  busy: "Busy",
  very_busy: "Very busy",
};
