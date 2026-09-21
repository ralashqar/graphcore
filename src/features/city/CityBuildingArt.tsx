import { useEffect, useState } from "react";
import type { CityBusiness, CityProfile } from "../../domain/city";
import type { CityArtModel, CityArtState } from "../../domain/cityBuildingArt";
import { CityBrandPreview } from "./CityBrandPreview";
import { cityCall } from "./api";

export function CityBuildingArt(
  { business, dirty, onRefresh, profile, tier }: {
    business: CityBusiness;
    profile: CityProfile;
    tier: number;
    dirty: boolean;
    onRefresh: () => Promise<void>;
  },
) {
  const [state, setState] = useState<CityArtState | null>(null),
    [direction, setDirection] = useState(""),
    [model, setModel] = useState<CityArtModel>("nano"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [preset, setPreset] = useState("Creative studio");
  const [shape, setShape] = useState("Stepped terraces");
  const [height, setHeight] = useState("Balanced");
  const [branding, setBranding] = useState("Prominent");
  const [landscape, setLandscape] = useState("A few planted accents");
  const [personality, setPersonality] = useState("Warm and welcoming");
  const [selected, setSelected] = useState("");
  const [compare, setCompare] = useState(false);
  const candidate = state?.jobs.find((j) => j.id === selected && j.preview);
  const brief =
    `Business premises: ${preset}. Architectural character: ${shape}. Massing: ${height}, within the existing tile footprint. Branding: ${branding}, using the saved brand colours and logo. Landscape: ${landscape}. Personality: ${personality}. ${direction}`;
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
      `city-art:${business.id}:${business.draft_version}:${model}:${brief}`;
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
          direction: brief,
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
      <div className="city-building-workbench">
        <div className="city-studio-stage">
          <div className="city-studio-toolbar">
            <span>{candidate ? "Candidate preview" : "Current draft"}</span>
            <button
              type="button"
              disabled={!candidate}
              aria-pressed={compare}
              onClick={() => setCompare(!compare)}
            >
              Compare with draft
            </button>
            {candidate && (
              <button
                type="button"
                onClick={() => {
                  setSelected("");
                  setCompare(false);
                }}
              >
                Back to draft
              </button>
            )}
          </div>
          <div className={compare && candidate ? "city-studio-comparison" : ""}>
            {compare && candidate && (
              <CityBrandPreview
                profile={profile}
                tier={tier}
                id={business.id}
              />
            )}
            <CityBrandPreview
              profile={candidate
                ? { ...profile, buildingArt: candidate.preview }
                : profile}
              tier={tier}
              id={business.id}
            />
          </div>
          <p className="city-studio-note">
            Fixed isometric camera · Cozy toy diorama · One consistent plot
          </p>
        </div>
        <div className="city-studio-settings">
          <p>
            Describe your business and its personality. We use your saved logo
            and hero image, with City’s fixed isometric tile and cozy miniature
            style.
          </p>
          <fieldset className="city-preset-picker">
            <legend>Start with a building</legend>
            {[
              "Creative studio",
              "Modern office",
              "Neighbourhood shop",
              "Flagship store",
              "Garden campus",
            ].map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={preset === value}
                onClick={() => setPreset(value)}
              >
                {value}
              </button>
            ))}
          </fieldset>
          <div className="city-art-controls">
            <label>
              Building shape<select
                aria-label="Building shape"
                value={shape}
                onChange={(e) => setShape(e.target.value)}
              >
                {["Compact", "L-shaped", "Courtyard", "Stepped terraces"].map(
                  (v) => <option key={v}>{v}</option>,
                )}
              </select>
            </label>
            <label>
              Building proportions<select
                aria-label="Building proportions"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              >
                {["Low and broad", "Balanced", "Tall and slender"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Brand presence<select
                aria-label="Brand presence"
                value={branding}
                onChange={(e) => setBranding(e.target.value)}
              >
                {["Subtle", "Balanced", "Prominent"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Landscaping<select
                aria-label="Landscaping"
                value={landscape}
                onChange={(e) => setLandscape(e.target.value)}
              >
                {["Minimal", "A few planted accents", "Lush roof garden"].map(
                  (v) => <option key={v}>{v}</option>,
                )}
              </select>
            </label>
            <label>
              Personality<select
                aria-label="Personality"
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
              >
                {["Restrained and corporate", "Warm and welcoming", "Playful"]
                  .map((v) => <option key={v}>{v}</option>)}
              </select>
            </label>
            <label>
              Business direction<textarea
                maxLength={650}
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
              ? "Save your business details below before generating."
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
              credits even if the resulting artwork needs another attempt.
              Saving a candidate does not publish it.
            </small>
          </p>
          <p className="city-studio-note">
            These choices guide your next generated image. The preview changes
            when you select a completed candidate; adjusting controls does not
            spend credits.
          </p>
          {error && <p role="alert">{error}</p>}
        </div>
      </div>
      <h3>Generation history</h3>
      {!state?.jobs.length && (
        <p>
          Your generated candidates will appear here. Your current draft stays
          intact until you choose a replacement.
        </p>
      )}
      <div className="city-art-candidates">
        {state?.jobs.map((job) => (
          <article key={job.id}>
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
                Recover existing image — no new generation
              </button>
            )}
            {job.preview && (
              <button
                type="button"
                aria-pressed={selected === job.id}
                onClick={() => setSelected(job.id)}
              >
                Preview candidate
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
