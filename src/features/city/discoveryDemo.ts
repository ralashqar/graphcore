import { demoCity } from "./demo";
import type { DiscoveryData, TrailContent } from "../../domain/cityDiscovery";
export function discoveryDemo(): DiscoveryData {
  const businesses = demoCity().properties.slice(0, 5);
  const storefronts = businesses.map((p, i) => ({
    id: i < 2 ? p.id : `demo-free-${i}`,
    slug: i < 2 ? p.slug : `creator-${i}`,
    placement: i < 2 ? p : null,
    profile: {
      ...p.profile,
      sample: {
        kind: (i === 0 ? "comparison" : i === 1 ? "guided" : "gallery") as
          "comparison" | "guided" | "gallery",
        title: "Find your creative direction",
        items: [
          {
            label: "Editorial",
            image: "/city/demo-signs/forma-hero.svg",
            description: "A restrained layout for thoughtful stories.",
          },
          {
            label: "Expressive",
            image: "/city/demo-signs/offscript-hero.svg",
            description: "Bold shapes for playful launches.",
          },
        ],
      },
    },
  }));
  const trails = [
    "Make your first creative launch",
    "Build a visual identity",
  ].map((title, i) => ({
    id: `demo-trail-${i}`,
    slug: i ? "visual-identity" : "first-creative-launch",
    kind: "trail" as const,
    business_id: null,
    featured: false,
    content: {
      title,
      description:
        "A fictional guided introduction to tools for independent creators.",
      outcome: "Leave with a clearer creative direction.",
      cover: "/city/demo-signs/fieldwork-hero.svg",
      stops: storefronts
        .slice(i, i + 3)
        .map((b) => ({
          businessId: b.id,
          reason:
            "Explore a sample and choose an approach that fits your project.",
        })),
    } as TrailContent,
  }));
  return {
    now: new Date().toISOString(),
    storefronts,
    entries: [
      ...trails,
      {
        id: "demo-launch",
        slug: "creator-friday",
        kind: "launch",
        business_id: storefronts[2].id,
        featured: true,
        content: {
          title: "Creator Friday",
          description:
            "Fictional launch showcase. Try the sample and discover a new approach.",
          startsAt: new Date(Date.now() - 3600000).toISOString(),
          endsAt: new Date(Date.now() + 86400000).toISOString(),
        },
      },
    ],
    follows: [],
    savedLaunches: [],
    progress: [],
  };
}
