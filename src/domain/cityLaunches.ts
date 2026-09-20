import type { LaunchContent } from "./cityDiscovery.ts";

export const LAUNCH_TYPES = [
  "business",
  "product",
  "app",
  "game",
  "feature",
  "service",
  "restaurant",
  "menu",
  "collection",
  "physical_product",
  "event",
  "experience",
  "early_access",
  "crowdfunding",
  "major_update",
] as const;
export type LaunchPhase =
  | "coming_soon"
  | "launching"
  | "live"
  | "recent"
  | "archived";
export const LAUNCH_POLICY = {
  version: 1,
  revealMinutes: 15,
  liveHours: 24,
  recentDays: 7,
  upcomingDays: 3,
  halfLifeHours: 6,
  windowHours: 48,
  minimumActors: 5,
} as const;
export function launchPhase(content: LaunchContent, now: number): LaunchPhase {
  const start = Date.parse(content.startsAt),
    end = Math.min(Date.parse(content.endsAt), start + 7 * 86400000);
  if (!Number.isFinite(start) || !Number.isFinite(end) || now >= end) {
    return "archived";
  }
  if (now < start) return "coming_soon";
  if (now < start + 15 * 60000) return "launching";
  return now < start + 86400000 ? "live" : "recent";
}
export const launchPhaseLabel: Record<LaunchPhase, string> = {
  coming_soon: "Coming soon",
  launching: "Launching now",
  live: "Launched today",
  recent: "Recently launched",
  archived: "Launch history",
};
export type LaunchItem = {
  id: string;
  slug: string;
  business_id: string;
  business_slug: string;
  business_name: string;
  content: LaunchContent;
  phase: LaunchPhase;
  interested: number;
  score: number;
  rank: number | null;
  viewerInterested: boolean;
};
export type LaunchCatalog = {
  items: LaunchItem[];
  hasMore: boolean;
  serverTime: string;
  expiresAt: string;
  plazaEnabled: boolean;
};
export function plazaLaunches(items: LaunchItem[], now: number): LaunchItem[] {
  const upcoming = items.filter((i) =>
    launchPhase(i.content, now) === "coming_soon" &&
    Date.parse(i.content.startsAt) <= now + 3 * 86400000
  ).sort((a, b) =>
    Date.parse(a.content.startsAt) - Date.parse(b.content.startsAt) ||
    a.id.localeCompare(b.id)
  );
  const current = items.filter((i) =>
    !["coming_soon", "archived"].includes(launchPhase(i.content, now))
  ).sort((a, b) =>
    (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
    Date.parse(b.content.startsAt) - Date.parse(a.content.startsAt) ||
    a.id.localeCompare(b.id)
  );
  const selected = [...current.slice(0, 8), ...upcoming.slice(0, 4)];
  return [...selected, ...current.slice(8), ...upcoming.slice(4)].slice(0, 12);
}
export function launchContribution(
  weight: number,
  firstAt: number,
  now: number,
) {
  return now - firstAt > 48 * 3600000
    ? 0
    : weight * Math.pow(.5, Math.max(0, now - firstAt) / (6 * 3600000));
}
