import { CityLaunchStudio } from './CityLaunchStudio';
import { useEffect, useState } from "react";
import type {
  DiscoveryData,
  DiscoveryEntry,
  TrailContent,
  LaunchContent,
} from "../../domain/cityDiscovery";
import { cityCall, cityCommand } from "./api";
import { uploadDiscoveryImage } from "./CitySample";
export function CityDiscoveryStudio({
  businessId,
  admin = false,
}: {
  businessId?: string;
  admin?: boolean;
}) {
  const [data, setData] = useState<DiscoveryData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<DiscoveryEntry | null>(null),
    [slug, setSlug] = useState(""),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [outcome, setOutcome] = useState(""),
    [cover, setCover] = useState(""),
    [stops, setStops] = useState([
      { businessId: "", reason: "" },
      { businessId: "", reason: "" },
      { businessId: "", reason: "" },
    ]),
    [starts, setStarts] = useState(""),
    [ends, setEnds] = useState("");
  const load = async () =>
    setData(
      await cityCall<DiscoveryData>("city-api", {
        action: "discovery_workspace",
      }),
    );
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [businessId, admin]);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(entry: DiscoveryEntry) {
    const c = entry.draft!;
    setEditing(entry);
    setSlug(entry.slug);
    setTitle(c.title);
    setDescription(c.description);
    if (entry.kind === "trail") {
      const t = c as TrailContent;
      setOutcome(t.outcome);
      setCover(t.cover);
      setStops(t.stops);
    } else {
      setStarts((c as LaunchContent).startsAt.slice(0, 16));
      setEnds((c as LaunchContent).endsAt.slice(0, 16));
    }
  }
  const kind = admin ? "trail" : "launch";
  if(!admin && businessId && data?.launchesEnabled) return <CityLaunchStudio businessId={businessId} data={data} reload={load}/>;
  return (
    <section className="city-explore-studio">
      <h2>{admin ? "Curated discovery programme" : "Schedule a launch"}</h2>
      <p>
        {admin
          ? "Curate trails independently of paid ranking. Review exact submitted launch revisions."
          : "Submit a launch using your approved storefront sample and offer. Times below are UTC; publication needs operator review."}
      </p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await cityCommand("discovery_entry_save", {
              kind,
              slug,
              businessId,
              ...(editing ? { id: editing.id, version: editing.version } : {}),
              content: admin
                ? { title, description, outcome, cover, stops }
                : {
                    title,
                    description,
                    startsAt: new Date(starts + "Z").toISOString(),
                    endsAt: new Date(ends + "Z").toISOString(),
                  },
            });
            setEditing(null);
            setTitle("");
            setSlug("");
            setDescription("");
          });
        }}
      >
        <fieldset disabled={busy}>
          <legend>{editing ? "Edit submission" : "New " + kind}</legend>
          <label>
            Discovery title
            <input
              required
              maxLength={100}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Discovery address
            <input
              required
              disabled={!!editing}
              pattern="[a-z0-9][a-z0-9-]{2,47}"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </label>
          <label>
            Discovery description
            <textarea
              required
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          {admin ? (
            <>
              <label>
                Trail outcome
                <input
                  required
                  maxLength={200}
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                />
              </label>
              <label>
                Trail cover
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      void run(async () =>
                        setCover((await uploadDiscoveryImage(f)).path),
                      );
                  }}
                />
              </label>
              {cover && <small>Cover uploaded</small>}
              {stops.map((s, i) => (
                <div className="city-field-pair" key={i}>
                  <label>
                    Stop {i + 1} business
                    <select
                      required
                      value={s.businessId}
                      onChange={(e) =>
                        setStops((a) =>
                          a.map((v, n) =>
                            i === n ? { ...v, businessId: e.target.value } : v,
                          ),
                        )
                      }
                    >
                      <option value="">Select approved business</option>
                      {data?.storefronts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.profile.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Stop {i + 1} reason
                    <input
                      required
                      maxLength={300}
                      value={s.reason}
                      onChange={(e) =>
                        setStops((a) =>
                          a.map((v, n) =>
                            i === n ? { ...v, reason: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              ))}
              <div className="city-actions">
                <button
                  type="button"
                  disabled={stops.length >= 5}
                  onClick={() =>
                    setStops((v) => [...v, { businessId: "", reason: "" }])
                  }
                >
                  Add stop
                </button>
                <button
                  type="button"
                  disabled={stops.length <= 3}
                  onClick={() => setStops((v) => v.slice(0, -1))}
                >
                  Remove last stop
                </button>
              </div>
            </>
          ) : (
            <div className="city-field-pair">
              <label>
                Launch starts (UTC)
                <input
                  type="datetime-local"
                  required
                  value={starts}
                  onChange={(e) => setStarts(e.target.value)}
                />
              </label>
              <label>
                Launch ends (UTC)
                <input
                  type="datetime-local"
                  required
                  value={ends}
                  onChange={(e) => setEnds(e.target.value)}
                />
              </label>
            </div>
          )}
          <button className="city-primary">
            {busy ? "Saving…" : "Submit " + kind}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setSlug("");
              }}
            >
              Cancel editing
            </button>
          )}
        </fieldset>
      </form>
      {data?.drafts?.map((e) => (
        <article key={e.id} className="city-review">
          <div>
            <h3>{e.draft?.title}</h3>
            <p>
              {e.kind} · {e.review_state || e.status} · revision {e.version}
            </p>
            <p>{e.draft?.description}</p>
            <details>
              <summary>Inspect exact submission</summary>
              <pre>{JSON.stringify(e.draft, null, 2)}</pre>
            </details>
          </div>
          <div className="city-actions">
            {e.kind === kind && (
              <button disabled={busy} onClick={() => edit(e)}>
                Edit submission
              </button>
            )}
            {admin && (
              <>
                {["publish", "reject", "archive"].map((decision) => (
                  <button
                    key={decision}
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        cityCommand("discovery_entry_review", {
                          id: e.id,
                          version: e.version,
                          decision,
                          featured: false,
                        }),
                      )
                    }
                  >
                    {decision === "publish"
                      ? "Publish"
                      : decision === "reject"
                        ? "Reject"
                        : "Archive / cancel"}
                  </button>
                ))}
                {e.kind === "launch" && <button disabled={busy} onClick={()=>{const overrideReason=window.prompt("Explain the substantive release that justifies overriding the launch cooldown (at least 15 characters).");if(overrideReason&&overrideReason.trim().length>=15)void run(()=>cityCommand("discovery_entry_review",{id:e.id,version:e.version,decision:"publish",featured:false,overrideReason}));}}>Publish with audited cooldown exception</button>}
                {e.kind === "launch" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        cityCommand("discovery_entry_review", {
                          id: e.id,
                          version: e.version,
                          decision: "publish",
                          featured: true,
                        }),
                      )
                    }
                  >
                    Publish as featured launch
                  </button>
                )}
              </>
            )}
          </div>
        </article>
      ))}
      <h3>Discovery activity · last 30 days</h3>
      <p>
        Browser-reported, daily-deduplicated signals; not verified trials or
        sales. This pilot report covers up to 10,000 observations.
      </p>
      <button
        onClick={() => {
          const rows = [
            ["Context", "Event", "Count"],
            ...(data?.metrics || []).map((m) => [
              m.scope,
              m.kind,
              String(m.count),
            ]),
          ];
          const u = URL.createObjectURL(
            new Blob([rows.map((r) => r.join(",")).join("\n")], {
              type: "text/csv",
            }),
          );
          const a = document.createElement("a");
          a.href = u;
          a.download = "city-explore-metrics.csv";
          a.click();
          setTimeout(() => URL.revokeObjectURL(u), 1000);
        }}
      >
        Export discovery activity
      </button>
      <ul>
        {data?.metrics?.map((m) => (
          <li key={m.scope + m.kind}>
            {m.kind.replaceAll("_", " ")}: {m.count} <small>{m.scope}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
