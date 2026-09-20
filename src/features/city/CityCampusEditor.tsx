import { DealExhibitPicker } from "./CityDealStudio";
import { useEffect, useState } from "react";
import type { CityBusiness, CityProfile } from "../../domain/city";
import {
  legacyCampus,
  type CityCampus,
  type CityExhibit,
  type CitySetupJob,
  type ExhibitKind,
} from "../../domain/cityCampus";
import { CampusPreview, CampusPreviewDetails } from "./CityCampus";
import { uploadDiscoveryImage } from "./CitySample";
import { cityCall, cityCommand } from "./api";
const kinds: ExhibitKind[] = [
  "gallery",
  "comparison",
  "guided",
  "walkthrough",
  "offer",
  "launch",
];
export function CityCampusEditor({
  business,
  onRefresh,
}: {
  business: CityBusiness;
  onRefresh: () => Promise<void>;
}) {
  const [space, setSpace] = useState<CityCampus>(() =>
      legacyCampus(business.draft),
    ),
    [index, setIndex] = useState(0),
    [previews, setPreviews] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [prompt, setPrompt] = useState(""),
    [message, setMessage] = useState(""),
    [jobData, setJobData] = useState<{
      jobs: (CitySetupJob & { preview?: CityProfile })[];
      metrics: Record<string, number>;
      setupEnabled: boolean;
    }>({ jobs: [], metrics: {}, setupEnabled: false }),
    [showPreview, setShowPreview] = useState(false);
  const load = async () =>
    setJobData(
      await cityCall<any>("city-api", {
        action: "campus_workspace",
        businessId: business.id,
      }),
    );
  useEffect(() => {
    setSpace(legacyCampus(business.draft));
    setIndex(0);
    setPreviews({});
  }, [business.id, business.draft_version]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void cityCall<any>("city-api", {
        action: "campus_workspace",
        businessId: business.id,
      })
        .then((d) => {
          if (active) setJobData(d);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [business.id]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const selected = space.exhibits[index] || space.exhibits[0];
  const update = (patch: Partial<CityExhibit>) =>
    setSpace((v) => ({
      ...v,
      exhibits: v.exhibits.map((e) =>
        e.id === selected.id ? { ...e, ...patch } : e,
      ),
    }));
  const previewProfile = {
    ...(business.preview || business.draft),
    campus: {
      ...space,
      exhibits: space.exhibits.map((e) => ({
        ...e,
        items: e.items.map((i) => {
          const imageMap = new Map<string, string>();
          const raw = legacyCampus(business.draft),
            signed = legacyCampus(business.preview || business.draft);
          raw.exhibits.forEach((entry, n) =>
            entry.items.forEach((item, k) => {
              if (item.image)
                imageMap.set(
                  item.image,
                  signed.exhibits[n]?.items[k]?.image || "",
                );
            }),
          );
          return {
            ...i,
            image:
              previews[i.image] ||
              imageMap.get(i.image) ||
              (i.image.startsWith("http") || i.image.startsWith("/")
                ? i.image
                : ""),
          };
        }),
      })),
    },
  };
  const start = async (refine: boolean) => {
    await cityCommand(refine ? "campus_refine" : "campus_start", {
      businessId: business.id,
      version: business.draft_version,
      requestKey: crypto.randomUUID(),
      prompt,
    });
    setMessage(
      "Setup queued. You can leave this page and return to the saved result.",
    );
  };
  return (
    <section className="city-campus-editor">
      <header>
        <p className="city-eyebrow">YOUR BUSINESS SPACE</p>
        <h2>One address. More to discover.</h2>
        <p>
          Arrange up to six exhibits around your headquarters. Save a draft,
          then use the property submission button to send the complete space for
          review.
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <fieldset disabled={busy}>
        <legend>Build from your website</legend>
        <p>{business.draft.website}</p>
        <label>
          What should visitors discover?
          <textarea
            maxLength={1500}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Show our photo editor and template library"
          />
        </label>
        <div className="city-actions">
          <button
            disabled={
              !jobData.setupEnabled ||
              jobData.jobs.some((j) => j.kind === "initial")
            }
            onClick={() => void run(() => start(false))}
          >
            Build my space from my website
          </button>
          <button
            disabled={
              !jobData.setupEnabled ||
              jobData.jobs.filter((j) => j.kind === "refine").length >= 2
            }
            onClick={() => void run(() => start(true))}
          >
            Refine saved draft with prompt
          </button>
        </div>
        <small>
          {jobData.setupEnabled
            ? "Pilot: one initial setup and two refinements. No credits charged."
            : "Automatic setup is paused. You can build and edit every exhibit manually."}{" "}
          Prompts use the last saved draft.
        </small>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Exhibit editor</legend>
        <label>
          Campus layout
          <select
            value={space.layout}
            onChange={(e) =>
              setSpace({
                ...space,
                layout: e.target.value as CityCampus["layout"],
              })
            }
          >
            <option value="courtyard">Courtyard</option>
            <option value="avenue">Avenue</option>
          </select>
        </label>
        <nav className="city-campus-stations" aria-label="Edit exhibit">
          {space.exhibits.map((e, i) => (
            <button
              key={e.id}
              aria-pressed={index === i}
              onClick={() => setIndex(i)}
            >
              {i + 1}. {e.title}
            </button>
          ))}
        </nav>
        <label>
          Exhibit title
          <input
            maxLength={100}
            value={selected.title}
            onChange={(e) => update({ title: e.target.value })}
          />
        </label>
        <label>
          Exhibit type
          <select
            value={selected.kind}
            onChange={(e) =>
              update({
                kind: e.target.value as ExhibitKind,
                confirmedPair: false,
                items: ["offer", "launch"].includes(e.target.value)
                  ? []
                  : selected.items.length
                    ? selected.items
                    : [
                        {
                          label: "Example",
                          description: "",
                          image: "",
                          sourceUrl: business.draft.website,
                        },
                      ],
              })
            }
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        {selected.kind !== "launch" && <DealExhibitPicker businessId={business.id} value={selected.dealId} onChange={dealId=>update({dealId})}/>}
        {selected.kind === "comparison" && (
          <label>
            <input
              type="checkbox"
              checked={selected.confirmedPair}
              onChange={(e) => update({ confirmedPair: e.target.checked })}
            />
            I confirm these two images are a genuine before/after pair.
          </label>
        )}
        {selected.items.map((item, i) => (
          <div className="city-campus-item" key={i}>
            <label>
              Item {i + 1} label
              <input
                maxLength={80}
                value={item.label}
                onChange={(e) =>
                  update({
                    items: selected.items.map((v, n) =>
                      n === i ? { ...v, label: e.target.value } : v,
                    ),
                  })
                }
              />
            </label>
            <label>
              Explanation
              <textarea
                maxLength={500}
                value={item.description}
                onChange={(e) =>
                  update({
                    items: selected.items.map((v, n) =>
                      n === i ? { ...v, description: e.target.value } : v,
                    ),
                  })
                }
              />
            </label>
            <label>
              Evidence URL
              <input
                type="url"
                value={item.sourceUrl}
                onChange={(e) =>
                  update({
                    items: selected.items.map((v, n) =>
                      n === i ? { ...v, sourceUrl: e.target.value } : v,
                    ),
                  })
                }
              />
            </label>
            <label>
              Upload image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void run(async () => {
                      const media = await uploadDiscoveryImage(file);
                      setPreviews((v) => ({ ...v, [media.path]: media.url }));
                      update({
                        items: selected.items.map((v, n) =>
                          n === i ? { ...v, image: media.path } : v,
                        ),
                      });
                    });
                }}
              />
            </label>
            {item.image && <small>Image attached</small>}
            <button
              disabled={selected.items.length <= 1}
              onClick={() =>
                update({ items: selected.items.filter((_, n) => n !== i) })
              }
            >
              Remove item {i + 1}
            </button>
          </div>
        ))}
        {!["offer", "launch"].includes(selected.kind) && (
          <button
            disabled={selected.items.length >= 5}
            onClick={() =>
              update({
                items: [
                  ...selected.items,
                  {
                    label: "Example " + (selected.items.length + 1),
                    image: "",
                    description: "",
                    sourceUrl: business.draft.website,
                  },
                ],
              })
            }
          >
            Add example
          </button>
        )}
        <div className="city-actions">
          <button
            disabled={index === 0}
            onClick={() => {
              const next = [...space.exhibits];
              [next[index - 1], next[index]] = [next[index], next[index - 1]];
              setSpace({ ...space, exhibits: next });
              setIndex(index - 1);
            }}
          >
            Move earlier
          </button>
          <button
            disabled={index === space.exhibits.length - 1}
            onClick={() => {
              const next = [...space.exhibits];
              [next[index + 1], next[index]] = [next[index], next[index + 1]];
              setSpace({ ...space, exhibits: next });
              setIndex(index + 1);
            }}
          >
            Move later
          </button>
          <button
            aria-pressed={space.primaryId === selected.id}
            onClick={() => setSpace({ ...space, primaryId: selected.id })}
          >
            Use as primary exhibit
          </button>
          <button
            disabled={space.exhibits.length <= 1}
            onClick={() => {
              const next = space.exhibits.filter((e) => e.id !== selected.id);
              setSpace({
                ...space,
                exhibits: next,
                primaryId:
                  space.primaryId === selected.id
                    ? next[0].id
                    : space.primaryId,
              });
              setIndex(0);
            }}
          >
            Remove exhibit
          </button>
          <button
            disabled={space.exhibits.length >= 6}
            onClick={() => {
              setSpace({
                ...space,
                exhibits: [
                  ...space.exhibits,
                  {
                    id: "exhibit-" + crypto.randomUUID().slice(0, 8),
                    title: "New exhibit",
                    kind: "gallery",
                    confirmedPair: false,
                    items: [
                      {
                        label: "Example",
                        description: "",
                        image: "",
                        sourceUrl: business.draft.website,
                      },
                    ],
                  },
                ],
              });
              setIndex(space.exhibits.length);
            }}
          >
            Add exhibit
          </button>
        </div>
        <div className="city-actions">
          <button
            className="city-primary"
            onClick={() =>
              void run(async () => {
                await cityCommand("campus_save", {
                  businessId: business.id,
                  version: business.draft_version,
                  campus: space,
                });
                await onRefresh();
                setMessage(
                  "Campus draft saved. Submit the property for review when ready.",
                );
              })
            }
          >
            Save campus draft
          </button>
          <button onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? "Close" : "Open"} campus preview
          </button>
        </div>
      </fieldset>
      {showPreview && <CampusPreview profile={previewProfile} />}
      {jobData.jobs.map((job) => (
        <article className="city-campus-job" key={job.id}>
          <h3>
            {job.kind === "initial" ? "Website setup" : "Prompt refinement"} ·{" "}
            {job.status}
          </h3>
          <p>
            {job.stage.replaceAll("_", " ")} · based on property revision{" "}
            {job.base_version}
          </p>
          {job.error && <p>{job.error}</p>}
          {job.candidate && (
            <>
              <p>{job.candidate.summary}</p>
              <ul>
                {job.candidate.missing.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
              <details>
                <summary>Inspect proposed changes and source evidence</summary>
                <pre>
                  {JSON.stringify(
                    {
                      current:
                        business.draft.campus || legacyCampus(business.draft),
                      proposed: job.candidate.profile.campus,
                      sources: job.manifest?.pages.map((p) => p.url),
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
              {job.preview && (
                <CampusPreviewDetails
                  profile={job.preview}
                  label="Preview proposed campus"
                />
              )}
            </>
          )}
          <div className="city-actions">
            {job.status === "ready" && (
              <button
                disabled={busy || job.base_version !== business.draft_version}
                onClick={() =>
                  void run(async () => {
                    await cityCommand("campus_apply", {
                      businessId: business.id,
                      id: job.id,
                      version: business.draft_version,
                    });
                    await onRefresh();
                    setMessage(
                      "Candidate applied to draft. Review and submit the property to publish.",
                    );
                  })
                }
              >
                Apply reviewed candidate to draft
              </button>
            )}
            {(job.status === "failed" ||
              (job.status === "ready" &&
                job.manifest?.images.some((i) => i.failed))) && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    cityCommand("campus_retry", {
                      businessId: business.id,
                      id: job.id,
                    }),
                  )
                }
              >
                Retry saved setup / missing media
              </button>
            )}
            {["queued", "running", "uncertain", "ready", "failed"].includes(
              job.status,
            ) && (
              <button
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    cityCommand("campus_cancel", {
                      businessId: business.id,
                      id: job.id,
                    }),
                  )
                }
              >
                Cancel setup
              </button>
            )}
          </div>
        </article>
      ))}
      <details>
        <summary>Exhibit activity · last 30 days</summary>
        {Object.entries(jobData.metrics).map(([key, count]) => (
          <p key={key}>
            {key.replaceAll(":", " · ")}: {count}
          </p>
        ))}
        <p>
          Daily visitor-deduplicated observations, excluding owner activity.
          These are not verified conversions.
        </p>
      </details>
    </section>
  );
}
