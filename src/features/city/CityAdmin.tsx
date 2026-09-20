import { CityDiscoveryStudio } from "./CityDiscoveryStudio";
import { CitySample } from "./CitySample";
import { useEffect, useState } from "react";
import type { CityBusiness, CityOrder } from "../../domain/city";
import { cityCall, cityCommand } from "./api";
type Report = { id: string; business_id: string; reason: string };
export function CityAdmin({
  discoveryEnabled = false,
}: {
  discoveryEnabled?: boolean;
}) {
  const [data, setData] = useState<{
      businesses: (CityBusiness & { analytics?: Record<string, number> })[];
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
      {data && (
        <section className="city-business-section" aria-label="Pilot dashboard">
          <h2>Pilot readiness & results</h2>
          <p>
            Start with 5-10 approved businesses. This table covers the latest
            100 businesses; metrics cover the last 30 UTC days.
          </p>
          <button
            onClick={() => {
              const rows = [
                [
                  "Business",
                  "Stage",
                  "Views",
                  "Clicks",
                  "Claims",
                  "Signed-in visitors",
                  "Returning signed-in visitors",
                ],
                ...data.businesses.map((b) => [
                  b.draft.name,
                  b.status,
                  ...[
                    "views30d",
                    "clicks30d",
                    "claims30d",
                    "signedInVisitors30d",
                    "returningVisitors30d",
                  ].map((k) => b.analytics?.[k] || 0),
                ]),
              ];
              const csv = rows
                .map((row) =>
                  row
                    .map(
                      (value) =>
                        '"' +
                        String(value)
                          .replace(/^[=+@\-\t\r]/, "'$&")
                          .replaceAll('"', '""') +
                        '"',
                    )
                    .join(","),
                )
                .join("\r\n");
              const url = URL.createObjectURL(
                new Blob([csv], { type: "text/csv;charset=utf-8" }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "synarc-city-pilot.csv";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Export pilot results
          </button>
          <div className="city-table-wrap">
            <table className="city-pilot-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Next step</th>
                  <th>Views</th>
                  <th>Clicks</th>
                  <th>Claims</th>
                  <th>Returning / signed-in</th>
                </tr>
              </thead>
              <tbody>
                {data.businesses.map((b) => (
                  <tr key={b.id}>
                    <td>{b.draft.name}</td>
                    <td>
                      {b.status === "suspended"
                        ? "Suspended"
                        : !b.verified_at
                          ? "Verify domain"
                          : b.status !== "approved"
                            ? "Review property"
                            : !b.land_value
                              ? "First purchase"
                              : !b.published?.offer.title
                                ? "Add an offer"
                                : "Pilot active"}
                    </td>
                    <td>{b.analytics?.views30d || 0}</td>
                    <td>{b.analytics?.clicks30d || 0}</td>
                    <td>{b.analytics?.claims30d || 0}</td>
                    <td>
                      {b.analytics?.returningVisitors30d || 0} /{" "}
                      {b.analytics?.signedInVisitors30d || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small>
            Views and clicks use daily anonymous deduplication. Returns measure
            signed-in people visiting a property on multiple days, excluding
            owners. No purchase attribution is claimed.
          </small>
        </section>
      )}
      {discoveryEnabled && <CityDiscoveryStudio admin />}
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
            {b.preview?.billboard && (
              <img
                className="city-review-media"
                src={b.preview.billboard}
                alt="Submitted billboard image"
              />
            )}
            {b.preview?.sample && <CitySample sample={b.preview.sample} />}
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
