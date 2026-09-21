import { useEffect, useState } from "react";
import type { CityBusiness } from "../../domain/city";
import type { CityArtModel, CityArtState } from "../../domain/cityBuildingArt";
import { cityCall } from "./api";

export function CityBuildingArt(
  { business, dirty, onRefresh }: {
    business: CityBusiness;
    dirty: boolean;
    onRefresh: () => Promise<void>;
  },
) {
  const [state, setState] = useState<CityArtState | null>(null),
    [direction, setDirection] = useState(""),
    [model, setModel] = useState<CityArtModel>("nano"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = state?.jobs.some((j) =>
    j.status === "queued" || j.status === "running"
  );
  useEffect(() => {
    let mounted = true;
    const read = async () => {
      try {
        const s = await cityCall<CityArtState>("city-building-art", {
          action: "read",
          businessId: business.id,
        });
        if (mounted) setState(s);
      } catch (e) {
        if (mounted) setError((e as Error).message);
      }
    };
    void read();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void read();
    }, active ? 5000 : 60000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [business.id, active]);
  async function command(
    action: "generate" | "apply" | "retry",
    jobId?: string,
  ) {
    setBusy(true);
    setError("");
    const key =
      `city-art:${business.id}:${business.draft_version}:${model}:${direction}`;
    try {
      if (action === "generate") {
        jobId = sessionStorage.getItem(key) || crypto.randomUUID();
        sessionStorage.setItem(key, jobId);
      }
      setState(
        await cityCall<CityArtState>("city-building-art", {
          action,
          businessId: business.id,
          version: business.draft_version,
          jobId,
          model,
          direction,
        }),
      );
      if (action === "generate") sessionStorage.removeItem(key);
      else if (action === "apply") await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="city-analytics city-art-studio"
      aria-label="Building artwork"
    >
      <div className="city-section-heading">
        <span>YOUR BUILDING</span>
        <h2>A place that looks like your business</h2>
      </div>
      <p>
        Describe your business and its personality. We use your saved logo and
        hero image, with City’s fixed isometric tile and cozy miniature style.
      </p>
      <div className="city-art-controls">
        <label>
          Business direction<textarea
            maxLength={1200}
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            placeholder="A welcoming design studio with a bright entrance and a roof garden"
          />
        </label>
        <label>
          Image model<select
            value={model}
            onChange={(e) => setModel(e.target.value as CityArtModel)}
          >
            <option value="nano">Nano Banana 2</option>
            <option value="gpt">GPT Image 2</option>
          </select>
        </label>
      </div>
      <p>
        {dirty
          ? "Save your business changes above before generating."
          : state?.enabled
          ? "Art is reviewed as a candidate, then added to your draft for publication review."
          : "Building generation is awaiting server activation."}
      </p>
      <button
        type="button"
        disabled={busy || active || dirty || !state?.enabled ||
          !state.prices[model]}
        onClick={() => void command("generate")}
      >
        {active
          ? "Generating your building…"
          : `Generate building${
            state?.prices[model] ? ` · ${state.prices[model]} credits` : ""
          }`}
      </button>
      <p>
        <small>
          One image generation per request. Provider generation uses SynArc
          credits even if the resulting artwork needs another attempt. Saving a
          candidate does not publish it.
        </small>
      </p>
      {error && <p role="alert">{error}</p>}
      <div style={{ display: "flex", gap: 16, overflowX: "auto" }}>
        {state?.jobs.map((job) => (
          <article key={job.id} style={{ minWidth: 220, maxWidth: 280 }}>
            {job.preview && (
              <img
                src={job.preview}
                alt={`Generated building for ${business.draft.name}`}
                width={240}
                height={240}
                style={{ objectFit: "contain", background: "#e6e9e1" }}
              />
            )}
            <p>
              {job.status === "completed"
                ? "Ready to review"
                : job.status === "running"
                ? "Generating and checking tile alignment"
                : job.status}
            </p>
            {job.error && <p>{job.error}</p>}
            {job.status === "failed" && job.recoverable && (
              <button
                type="button"
                disabled={busy || active}
                onClick={() => void command("retry", job.id)}
              >
                Recover existing image � no new generation
              </button>
            )}
            {job.preview && (
              <button
                type="button"
                disabled={busy || dirty ||
                  job.version !== business.draft_version}
                onClick={() => void command("apply", job.id)}
              >
                Use in property draft
              </button>
            )}
            {job.preview && job.version !== business.draft_version && (
              <small>This candidate belongs to an earlier saved draft.</small>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
