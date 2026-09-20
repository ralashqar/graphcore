import { useEffect, useState } from "react";
import type { CityBusiness, CityOrder } from "../../domain/city";
import { cityCall, cityCommand } from "./api";
type Report = { id: string; business_id: string; reason: string };
export function CityAdmin() {
  const [data, setData] = useState<{
      businesses: CityBusiness[];
      reports: Report[];
      orders: CityOrder[];
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notes, setNotes] = useState<Record<string, string>>({});
  async function refresh() {
    try {
      setData(await cityCall("city-api", { action: "admin" }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function review(b: CityBusiness, decision: string) {
    setBusy(true);
    setError("");
    try {
      await cityCommand("review", {
        businessId: b.id,
        version: b.draft_version,
        decision,
        note: notes[b.id] || "",
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="city-management">
      <header className="city-page-heading">
        <p className="city-eyebrow">CITY OPERATIONS</p>
        <h1>Review the next neighbours.</h1>
        <p>Approve the submitted version. Every decision is recorded.</p>
      </header>
      {error && (
        <p role="alert" className="city-message">
          {error}
        </p>
      )}
      {!data && !error && <p>Loading review queue…</p>}
      {data?.businesses.map((b) => (
        <section className="city-review" key={b.id}>
          <div>
            <span className="city-status">
              {b.status} · revision {b.draft_version}
            </span>
            <h2>{b.draft.name}</h2>
            <a href={b.draft.website} target="_blank" rel="noopener noreferrer">
              {b.draft.website}
            </a>
            <p>{b.draft.description}</p>
            {b.preview?.logo && (
              <img
                className="city-review-logo"
                src={b.preview.logo}
                alt="Submitted logo"
              />
            )}
            {b.preview?.hero && (
              <img
                className="city-review-media"
                src={b.preview.hero}
                alt="Submitted property image"
              />
            )}
            {b.preview?.video && (
              <video
                className="city-review-media"
                controls
                preload="none"
                src={b.preview.video}
              />
            )}
            <p>
              Offer: {b.draft.offer.title || "None"} ·{" "}
              {b.draft.offer.description}
            </p>
            <p>{b.verified_at ? "Domain verified" : "Domain not verified"}</p>
            <details>
              <summary>Inspect complete submitted profile</summary>
              <pre>{JSON.stringify(b.draft, null, 2)}</pre>
            </details>
          </div>
          <div>
            <label>
              Decision reason
              <textarea
                value={notes[b.id] || ""}
                onChange={(e) =>
                  setNotes((n) => ({ ...n, [b.id]: e.target.value }))
                }
              />
            </label>
            <div className="city-actions">
              <button
                disabled={busy || !notes[b.id] || b.status !== "pending"}
                onClick={() => review(b, "approve")}
              >
                Approve
              </button>
              <button
                disabled={busy || !notes[b.id] || b.status !== "pending"}
                onClick={() => review(b, "reject")}
              >
                Reject
              </button>
              <button
                disabled={busy || !notes[b.id] || b.status === "suspended"}
                onClick={() => review(b, "suspend")}
              >
                Suspend
              </button>
            </div>
          </div>
        </section>
      ))}
      <h2>Reports</h2>
      {data?.reports.length === 0 && <p>No open reports.</p>}
      {data?.reports.map((r) => (
        <div className="city-review" key={r.id}>
          <p>
            {r.reason}
            <small>Business {r.business_id}</small>
          </p>
          <button
            onClick={async () => {
              try {
                await cityCommand("resolve_report", { reportId: r.id });
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Mark resolved
          </button>
        </div>
      ))}
      <h2>Payment exceptions</h2>
      {data?.orders.length === 0 && <p>No payment exceptions.</p>}
      {data?.orders.map((o) => (
        <p key={o.id}>
          {o.id} · {o.status}
        </p>
      ))}
    </div>
  );
}
