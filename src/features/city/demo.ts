import {
  buildingTier,
  cityPlots,
  emptyCityProfile,
  type CitySnapshot,
} from "../../domain/city";
const brands = [
  ["Fieldwork", "Tools for a more thoughtful working day.", "SaaS", "#506b58"],
  ["Offscript", "Independent games. Unexpected worlds.", "Games", "#b37352"],
  ["Forma", "Objects made to be lived with.", "Shopping", "#a39982"],
  ["Northline", "Take the slower route.", "Travel", "#687d87"],
  ["Common Ground", "Good coffee. Better company.", "Food", "#987052"],
  ["Papercut", "A little room for a big idea.", "Creators", "#8d7274"],
  ["Tidal", "Everyday essentials, considered.", "Shopping", "#668c88"],
  ["Monday Studio", "Build something worth keeping.", "Apps", "#c6a262"],
];
const artwork = [
  "fieldwork",
  "offscript",
  "forma",
  "northline",
  "common-ground",
  "papercut",
  "tidal",
  "monday",
];
export function demoCity(count = 72, corporate = false): CitySnapshot {
  const plots = cityPlots(Math.max(count, 400));
  return {
    revision: 1,
    capacity: plots.length,
    total: count,
    onboardingEnabled: false,
    purchasesEnabled: false,
    demo: true,
    events: [],
    properties: Array.from({ length: count }, (_, i) => {
      const [brand, tagline, category, color] = brands[i % brands.length],
        profile = emptyCityProfile();
      const landValue = Math.max(
        1000,
        Math.round(6800000 / Math.pow(i + 1, 1.5) / 100) * 100,
      );
      Object.assign(profile, {
        name: i < 8 ? brand : `${brand} ${Math.floor(i / 8) + 1}`,
        tagline,
        category,
        color,
        website: "https://example.com",
        logo: [4, 5].includes(i % 8)
          ? ""
          : `/city/demo-signs/${artwork[i % 8]}-logo.svg`,
        hero: [3, 5, 6].includes(i % 8)
          ? ""
          : `/city/demo-signs/${artwork[i % 8]}-hero.svg`,
        description:
          "A demonstration property showing how a business can make a home in Synarc City. These brands and placements are fictional.",
      });
      if (i % 3 === 0)
        profile.offer = {
          title: "A welcome worth exploring",
          description:
            "Demonstration offer. No purchase or reward is available.",
          code: "",
          expiresAt: null,
          url: "",
        };
      if (corporate && i < 3) {
        Object.assign(profile, {
          name: ["Nike", "Slack", "Zoom"][i],
          tagline: "Unofficial architectural concept · visual experiment",
          description: "An independently generated branding study, not an official building, participating merchant or endorsement. Position and City Value are simulated demo data.",
          color: ["#151515", "#4a154b", "#2d8cff"][i],
          category: i === 0 ? "Shopping" : "SaaS",
          logo: "", hero: "",
          website: "", offer: emptyCityProfile().offer,
        });
      }
      return {
        id: `demo-${i}`,
        slug: `demo-${i}`,
        profile,
        landValue,
        rank: i + 1,
        ...plots[i],
        tier: buildingTier(landValue),
        saves: 0,
        claims: 0,
      };
    }),
  };
}
