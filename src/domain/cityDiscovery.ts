import { launchPhase } from "./cityLaunches.ts";
import type { CityProfile, CityProperty } from "./city.ts";
export type CitySample = {
  kind: "comparison" | "gallery" | "guided";
  title: string;
  items: { label: string; image: string; description: string }[];
};
export type CityStorefront = {
  id: string;
  slug: string;
  profile: CityProfile;
  placement: CityProperty | null;
};
export type TrailContent = {
  title: string;
  description: string;
  outcome: string;
  cover: string;
  stops: { businessId: string; reason: string }[];
};
export type LaunchContent = {
  schemaVersion?: 2;
  launchType?: string;
  productKey?: string;
  tagline?: string;
  category?: string;
  secondaryCategories?: string[];
  cover?: string;
  screenshots?: string[];
  trailer?: string;
  destination?: string;
  rewardDealId?: string | null;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
};
export type DiscoveryEntry = {
  id: string;
  slug: string;
  kind: "trail" | "launch";
  business_id: string | null;
  content: TrailContent | LaunchContent;
  featured: boolean;
  version?: number;
  status?: string;
  review_state?: string;
  draft?: TrailContent | LaunchContent;
};
export type DiscoveryData = {
  launchesEnabled?: boolean;
  now: string;
  storefronts: CityStorefront[];
  entries: DiscoveryEntry[];
  follows: string[];
  savedLaunches: string[];
  progress: { trail_id: string; completed: string[] }[];
  drafts?: DiscoveryEntry[];
  metrics?: { scope: string; kind: string; count: number }[];
  hasMore?: boolean;
};
export function launchState(content: LaunchContent, now: number) {
  const phase=launchPhase(content,now);
  return phase==='coming_soon'?'Upcoming':phase==='archived'?'Past':'Live';
}
export function eligibleStorefront(b: { published: unknown; status: string }) {
  return !!b.published && b.status !== "suspended";
}
