import { supabase } from "../../utils/supabase";
import type { CitySnapshot, CityWorkspace } from "../../domain/city";
export async function cityCall<T>(
  fn: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, {
    body: payload,
  });
  if (error) {
    let message = error.message;
    try {
      const body = await error.context?.json();
      message = body?.error || message;
    } catch {
      /* transport error */
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
export const cityCommand = <T = Record<string, unknown>>(
  action: string,
  data: Record<string, unknown> = {},
) => cityCall<T>("city-command", { action, ...data });
export const citySnapshot = (data: Record<string, unknown> = {}) =>
  cityCall<CitySnapshot>("city-api", { action: "snapshot", ...data });
export const cityWorkspace = () =>
  cityCall<CityWorkspace>("city-api", { action: "workspace" });
export function cityNavigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export async function downloadCityCard(
  name: string,
  rank: number,
  value: string,
  color: string,
  recordedAt?: string,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image export is unavailable.");
  ctx.fillStyle = "#eeeae0";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = color;
  ctx.fillRect(850, 0, 350, 630);
  ctx.fillStyle = "#263c30";
  ctx.font = "500 24px sans-serif";
  ctx.fillText("SYNARC / CITY", 70, 75);
  ctx.font = "600 62px sans-serif";
  ctx.fillText(name.slice(0, 24), 70, 225, 740);
  ctx.font = "500 42px sans-serif";
  ctx.fillText(`A new perspective. City rank #${rank}.`, 70, 300, 740);
  ctx.font = "400 25px sans-serif";
  ctx.fillText(`${value} in sponsored City Value`, 70, 365);
  ctx.font = "400 20px sans-serif";
  ctx.fillText(new Date(recordedAt || Date.now()).toLocaleString("en-GB"), 70, 540);
  ctx.fillStyle = "#fff";
  ctx.font = "600 112px sans-serif";
  ctx.fillText(`#${rank}`, 890, 350, 270);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image export failed."))),
      "image/png",
    ),
  );
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = "synarc-city-property.png";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
