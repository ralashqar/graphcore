import { resolveStorefront, storefrontVisual } from "../../domain/cityLiving";
import { useEffect, useState } from "react";
import {
  LAUNCH_TYPES,
  launchPhase,
  launchPhaseLabel,
} from "../../domain/cityLaunches";
import type {
  DiscoveryData,
  DiscoveryEntry,
  LaunchContent,
} from "../../domain/cityDiscovery";
import { cityCall, cityCommand } from "./api";
import { uploadDiscoveryImage } from "./CitySample";
import type { CityDeal } from "../../domain/cityDeals";
const initial = (): LaunchContent => ({
  schemaVersion: 2,
  title: "",
  description: "",
  tagline: "",
  productKey: "",
  launchType: "product",
  category: "Creators",
  secondaryCategories: [],
  cover: "",
  screenshots: [],
  trailer: "",
  destination: "",
  rewardDealId: null,
  startsAt: new Date(Date.now() + 86400000).toISOString(),
  endsAt: new Date(Date.now() + 8 * 86400000).toISOString(),
});
function localDate(value: string) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString()
    .slice(0, 16);
}
export function CityLaunchStudio(
  { businessId, data, reload }: {
    businessId: string;
    data: DiscoveryData;
    reload: () => Promise<void>;
  },
) {
  const [timezone, setTimezone] = useState("device");
  const [content, setContent] = useState(initial),
    [slug, setSlug] = useState(""),
    [editing, setEditing] = useState<DiscoveryEntry | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(false),
    [deals, setDeals] = useState<CityDeal[]>([]),
    [media, setMedia] = useState<Record<string, string>>({}),
    [metrics, setMetrics] = useState<Record<string, unknown>[]>([]);
  const storefrontPreview=resolveStorefront([
    ...deals.map(d=>({key:'deal:'+d.id,kind:'deal',title:d.terms.title,destination:'/city/deal/'+d.id,starts_at:d.terms.startsAt,ends_at:d.terms.endsAt,remaining:Math.max(0,d.quantity-d.issued),free:!!d.terms.freeConfirmed,exclusive:d.terms.exclusive,available:!d.paused&&!d.ended})),
    {key:'launch:draft',kind:'launch',title:content.title,destination:'/city/launches/'+slug,starts_at:content.startsAt,ends_at:content.endsAt,remaining:null,free:false,exclusive:false,available:true}
  ],Date.now());
  const entries = (data.drafts || []).filter((e) =>
    e.kind === "launch" && e.business_id === businessId
  );
  useEffect(() => {
    let live = true;
    void cityCall<{ deals: CityDeal[] }>("city-api", {
      action: "deal_workspace",
      businessId,
    }).then((r) => {
      if (live) {
        setDeals((r.deals || []).filter((d) => d.status === "approved"));
      }
    }).catch(() => {});
    void cityCall<{ items: Record<string, unknown>[] }>("city-api", {
      action: "launch_analytics",
      businessId,
    }).then((r) => {
      if (live) setMetrics(r.items || []);
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [businessId, data]);
  const change = <K extends keyof LaunchContent>(
    key: K,
    value: LaunchContent[K],
  ) => setContent((c) => ({ ...c, [key]: value }));
  async function save(draft: boolean) {
    setBusy(true);
    setError("");
    try {
      await cityCommand("discovery_entry_save", {
        kind: "launch",
        slug,
        businessId,
        saveDraft: draft,
        ...(editing ? { id: editing.id, version: editing.version } : {}),
        content,
      });
      await reload();
      setEditing(null);
      setContent(initial());
      setSlug("");
      setError(
        draft ? "Private draft saved." : "Submitted for publication review.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(
    file: File,
    field: "cover" | "screenshots" | "trailer",
  ) {
    setBusy(true);
    setError("");
    try {
      let r: { path: string; url: string };
      if (field === "trailer") {
        if (file.type !== "video/mp4" || file.size > 20_000_000) {
          throw new Error("Choose an MP4 up to 20 MB.");
        }
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () => reject(new Error("Unable to read video"));
          reader.readAsDataURL(file);
        });
        r = await cityCommand("upload", { base64 });
      } else r = await uploadDiscoveryImage(file);
      setMedia((m) => ({ ...m, [r.path]: r.url }));
      if (field === "screenshots") {
        change(field, [...(content.screenshots || []), r.path].slice(0, 5));
      } else change(field, r.path);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="city-explore-studio">
      <h2>Create a launch</h2>
      <p>
        Build interest before launch day. City Value controls your permanent
        position; customer interest controls launch attention.
      </p>
      {error && <p role="status">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        <fieldset disabled={busy}>
          <legend>{editing ? "Edit launch" : "New launch"}</legend>
          {(["title", "tagline", "productKey", "destination"] as const).map(
            (k) => (
              <label key={k}>
                {({
                  title: "Title",
                  tagline: "One-line introduction",
                  productKey:
                    "Stable product identifier (reuse for major versions)",
                  destination: "Product URL",
                } as const)[k]}
                <input
                  required={k === "title" || k === "productKey"}
                  maxLength={k === "destination"
                    ? 2048
                    : k === "tagline"
                    ? 160
                    : k === "productKey"
                    ? 80
                    : 100}
                  type={k === "destination" ? "url" : "text"}
                  value={content[k] || ""}
                  onChange={(e) => change(k, e.target.value)}
                />
              </label>
            ),
          )}
          <label>
            Permanent launch address<input
              required
              disabled={!!editing}
              pattern="[a-z0-9][a-z0-9-]{2,47}"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </label>
          <label>
            Description<textarea
              required
              maxLength={1000}
              value={content.description}
              onChange={(e) => change("description", e.target.value)}
            />
          </label>
          <div className="city-field-pair">
            <label>
              Launch type<select
                value={content.launchType}
                onChange={(e) => change("launchType", e.target.value)}
              >
                {LAUNCH_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            <label>
              Category<select
                value={content.category}
                onChange={(e) => change("category", e.target.value)}
              >
                {[
                  "Creators",
                  "Games",
                  "AI",
                  "Apps",
                  "Shopping",
                  "Food",
                  "Fashion",
                  "Entertainment",
                  "Travel",
                  "SaaS",
                  "Physical Products",
                  "Events",
                ].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <label>
            Secondary categories (up to two, comma separated)<input
              value={content.secondaryCategories?.join(", ") || ""}
              onChange={(e) =>
                change(
                  "secondaryCategories",
                  e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                    .slice(0, 2),
                )}
            />
          </label>
          <label>
            Schedule timezone<select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              <option value="device">
                Device timezone ({Intl.DateTimeFormat().resolvedOptions()
                  .timeZone})
              </option>
              <option value="utc">UTC</option>
            </select>
          </label>
          <p>Dates are saved in UTC.</p>
          <div className="city-field-pair">
            {(["startsAt", "endsAt"] as const).map((k) => (
              <label key={k}>
                {k === "startsAt" ? "Launch starts" : "Discovery ends"}
                <input
                  type="datetime-local"
                  required
                  value={timezone === "utc"
                    ? content[k].slice(0, 16)
                    : localDate(content[k])}
                  onChange={(e) => {
                    if (e.target.value) {
                      change(
                        k,
                        new Date(
                          e.target.value + (timezone === "utc" ? "Z" : ""),
                        ).toISOString(),
                      );
                    }
                  }}
                />
              </label>
            ))}
          </div>
          {(["cover", "screenshots", "trailer"] as const).map((field) => (
            <label key={field}>
              {field}
              <input
                disabled={field === "screenshots" &&
                  (content.screenshots?.length || 0) >= 5}
                type="file"
                accept={field === "trailer"
                  ? "video/mp4"
                  : "image/png,image/jpeg,image/webp"}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void upload(file, field);
                  }
                }}
              />
              {field === "screenshots"
                ? `${content.screenshots?.length || 0}/5 uploaded`
                : content[field]
                ? "Uploaded"
                : ""}
            </label>
          ))}
          <label>
            Optional City Deal<select
              value={content.rewardDealId || ""}
              onChange={(e) => change("rewardDealId", e.target.value || null)}
            >
              <option value="">No reward</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>{d.terms.title}</option>
              ))}
            </select>
          </label>
          <p>
            Rewards use existing claim limits and inventory. Announcements do
            not imply limited stock.
          </p>
          <div className="city-actions">
            <button type="button" onClick={() => setPreview((v) => !v)}>
              Preview city presence
            </button>
            <button type="button" onClick={() => void save(true)}>
              Save private draft
            </button>
            <button className="city-primary" type="submit">
              Submit for review
            </button>
          </div>
          {preview && (
            <article className="city-launch-preview">
              <small>
                LAUNCH PLAZA PREVIEW ·{" "}
                {launchPhaseLabel[launchPhase(content, Date.now())]}
              </small>
              {media[content.cover || ""] && (
                <img
                  src={media[content.cover || ""]}
                  alt="Launch cover preview"
                />
              )}
              <h3>{content.title || "Your launch"}</h3>
              <p>Permanent storefront: {storefrontVisual[storefrontPreview.kind].label} · {storefrontPreview.primary?.title}</p>
              <p>{content.tagline || content.description}</p>
              <p>
                Purple launch signage ·{" "}
                {new Date(content.startsAt).toLocaleString()}
              </p>
              {content.rewardDealId && (
                <p>
                  Linked reward shown when available. Inventory comes from the
                  deal.
                </p>
              )}
            </article>
          )}
        </fieldset>
      </form>
      <h3>Launch history and drafts</h3>
      {entries.map((e) => (
        <article className="city-review" key={e.id}>
          <h4>{e.draft?.title}</h4>
          <p>{e.review_state || e.status} · revision {e.version}</p>
          <div className="city-actions">
            <button
              onClick={() => {
                setEditing(e);
                setSlug(e.slug);
                setContent({ ...initial(), ...(e.draft as LaunchContent) });
              }}
            >
              Edit
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void cityCommand("discovery_launch_pause", {
                  id: e.id,
                  paused: e.status !== "archived",
                }).then(reload).catch((err) => setError(err.message)).finally(
                  () => setBusy(false),
                );
              }}
            >
              {e.status === "archived" ? "Resume" : "Pause"}
            </button>
          </div>
        </article>
      ))}
      <h3>Launch performance</h3>
      <p>
        Observed opens are deduplicated browser signals. Claims are committed
        entitlements. Redemptions below are merchant-reported, not verified
        purchases.
      </p>
      {metrics.map((m) => (
        <article key={String(m.id)}>
          <h4>{String(m.title)}</h4>
          <p>
            {String(m.interested)} interested · {String(m.reminders)}{" "}
            reminders · {String(m.observedImpressions)} observed impressions ·
            {" "}
            {String(m.observedOpens)} observed opens · {String(m.productVisits)}
            {" "}
            product visits · {String(m.observedShares)} observed shares ·{" "}
            {String(m.claims)} claims · {String(m.merchantReportedRedemptions)}
            {" "}
            merchant-reported redemptions
          </p>
        </article>
      ))}
    </section>
  );
}
