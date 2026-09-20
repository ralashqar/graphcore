import type { CityProfile } from "./city.ts";
export type ExhibitKind =
  "comparison" | "gallery" | "guided" | "walkthrough" | "offer" | "launch";
export type CityExhibit = {
  id: string;
  title: string;
  kind: ExhibitKind;
  confirmedPair: boolean;
  dealId?: string;
  items: {
    label: string;
    image: string;
    description: string;
    sourceUrl: string;
  }[];
};
export type CityCampus = {
  version: 1;
  layout: "courtyard" | "avenue";
  primaryId: string;
  exhibits: CityExhibit[];
};
export type CitySetupJob = {
  id: string;
  status: string;
  stage: string;
  kind: string;
  error: string | null;
  base_version: number;
  candidate: {
    profile: CityProfile;
    summary: string;
    missing: string[];
  } | null;
  manifest: {
    pages: { url: string; text: string }[];
    images: {
      url: string;
      page: string;
      label: string;
      path?: string;
      failed?: boolean;
    }[];
    warnings: string[];
  } | null;
  created_at: string;
};
export function legacyCampus(profile: CityProfile): CityCampus {
  if (profile.campus) return profile.campus;
  const exhibits: CityExhibit[] = [];
  if (profile.sample)
    exhibits.push({
      id: "sample",
      title: profile.sample.title,
      kind: profile.sample.kind,
      confirmedPair: profile.sample.kind === "comparison",
      items: profile.sample.items.map((i) => ({
        ...i,
        sourceUrl: profile.website,
      })),
    });
  if (!exhibits.length)
    exhibits.push({
      id: "welcome",
      title: "Meet " + profile.name,
      kind: "gallery",
      confirmedPair: false,
      items: [
        {
          label: profile.name,
          image: profile.hero || profile.logo,
          description: profile.description,
          sourceUrl: profile.website,
        },
      ],
    });
  if (profile.offer.title)
    exhibits.push({
      id: "offer",
      title: "Current offer",
      kind: "offer",
      confirmedPair: false,
      items: [],
    });
  exhibits.push({
    id: "launches",
    title: "What's coming next",
    kind: "launch",
    confirmedPair: false,
    items: [],
  });
  return {
    version: 1,
    layout: "courtyard",
    primaryId: exhibits[0].id,
    exhibits,
  };
}
export function primarySample(campus: CityCampus): CityProfile["sample"] {
  const e = campus.exhibits.find((e) => e.id === campus.primaryId);
  if (!e || e.kind === "offer" || e.kind === "launch" || e.items.length < 2)
    return null;
  return {
    kind: e.kind === "walkthrough" ? "guided" : e.kind,
    title: e.title,
    items: e.items.map(({ label, image, description }) => ({
      label,
      image,
      description,
    })),
  };
}
export function campusSlots(layout: CityCampus["layout"]): [number, number][] {
  return layout === "courtyard"
    ? [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
        [-2, 1],
        [2, 1],
      ]
    : [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
        [-1, 2],
        [1, 2],
      ];
}
