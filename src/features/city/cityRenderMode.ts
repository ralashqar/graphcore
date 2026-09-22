/** Global rendering experiment. Saved business recipes are never rewritten. */
export function cityLightMode(search: string, configured = "true") {
 const override = new URLSearchParams(search).get("cityLight");
 return override === "1" || (override !== "0" && configured !== "false");
}
export const CITY_LIGHT_MODE = cityLightMode(
 typeof window === "undefined" ? "" : window.location.search,
 import.meta.env?.VITE_CITY_LIGHT_MODE,
);
