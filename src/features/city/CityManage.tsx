import { marketQuote, MerchantPosition, QuotePreview } from "./CityMarket";
import type { CityQuote } from "../../domain/cityMarket";
import { CustomerMetrics } from "./CityCustomer";
import { CityDealStudio } from "./CityDealStudio";
import { CityCampusEditor } from "./CityCampusEditor";
import { CitySampleEditor } from "./CitySample";
import { CityDiscoveryStudio } from "./CityDiscoveryStudio";
import { type FormEvent, useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle, UploadSimple } from "@phosphor-icons/react";
import {
  buildingTier,
  type CityProfile,
  type CitySnapshot,
  type CityWorkspace,
  emptyCityProfile,
  formatGBP,
  parsePurchase,
} from "../../domain/city";
import { cityCommand } from "./api";
import { CityBillboardArtwork, CityBrandPreview } from "./CityBrandPreview";
import { defaultBillboardCrop } from "../../domain/cityBranding";

export function CityManage({
  workspace,
  snapshot,
  onRefresh,
}: {
  workspace: CityWorkspace;
  snapshot: CitySnapshot | null;
  onRefresh: () => Promise<void>;
}) {
  const business = workspace.business;
  const [profile, setProfile] = useState<CityProfile>(
      business?.draft || emptyCityProfile(),
    ),
    [slug, setSlug] = useState(business?.slug || ""),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [amount, setAmount] = useState("100"),
    [terms, setTerms] = useState(false),
    [orderStatus, setOrderStatus] = useState("");
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => {
    setProfile(business?.draft || emptyCityProfile());
    setPreviews({});
  }, [business?.id, business?.draft_version]);
  useEffect(() => {
    const order = new URLSearchParams(location.search).get("order");
    if (!order) return;
    let active = true;
    let terminal = false;
    const poll = async () => {
      if (terminal) return;
      try {
        const result = await cityCommand<{ status: string; amount: number }>(
          "order_status",
          { orderId: order },
        );
        if (active) {
          setOrderStatus(result.status);
          terminal = !["checkout", "pending", "created"].includes(
            result.status,
          );
          if (terminal && business) {
            sessionStorage.removeItem(
              `city-checkout:${business.id}:${result.amount}`,
            );
          }
          await onRefresh();
        }
      } catch (error) {
        if (active) setMessage((error as Error).message);
      }
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [business?.id]);
  const field = <K extends keyof CityProfile>(key: K, value: CityProfile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }));
  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setMessage("");
    try {
      await fn();
    } catch (error) {
      if ((error as Error).message.startsWith("CHECKOUT_ENDED:") && business) {
        try {
          sessionStorage.removeItem(
            `city-checkout:${business.id}:${parsePurchase(amount)}`,
          );
        } catch {
          /* invalid amount */
        }
      }
      setMessage((error as Error).message.replace("CHECKOUT_ENDED: ", ""));
    } finally {
      setBusy("");
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    await run("save", async () => {
      await cityCommand(business ? "save" : "create", {
        businessId: business?.id,
        version: business?.draft_version,
        slug,
        profile,
      });
      await onRefresh();
      setMessage("Draft saved. Verify the website, then submit it for review.");
    });
  }
  let pennies = 0;
  try {
    pennies = parsePurchase(amount);
  } catch {
    /* displayed at checkout */
  }
  const nextValue = Number(business?.land_value || 0) + pennies;
  const [quote, setQuote] = useState<CityQuote | null>(null);
  useEffect(() => {
    setQuote(null);
    if (!snapshot?.marketEnabled || !business?.published || !pennies) return;
    let active = true;
    const timer = setTimeout(() => {
      void marketQuote(business.id, pennies)
        .then((q) => {
          if (active) setQuote(q);
        })
        .catch((e) => {
          if (active) setMessage(e.message);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    business?.id,
    business?.land_value,
    pennies,
    snapshot?.revision,
    snapshot?.marketEnabled,
  ]);
  const dirty = JSON.stringify(profile) !== JSON.stringify(business?.draft);
  const previewProfile: CityProfile = {
    ...profile,
    logo: profile.logo
      ? previews.logo ||
        (profile.logo === business?.draft.logo ? business.preview?.logo : "") ||
        ""
      : "",
    hero: profile.hero
      ? previews.hero ||
        (profile.hero === business?.draft.hero ? business.preview?.hero : "") ||
        ""
      : "",
    billboard: profile.billboard
      ? previews.billboard ||
        (profile.billboard === business?.draft.billboard
          ? business.preview?.billboard
          : "") ||
        ""
      : "",
  };
  return (
    <div className="city-management">
      <header className="city-page-heading">
        <p className="city-eyebrow">BUSINESS STUDIO</p>
        <h1>Your place in the city.</h1>
        <p>Bring your brand to life. Build a home people want to discover.</p>
      </header>
      {message && (
        <p className="city-message" role="status">
          {message}
        </p>
      )}
      {orderStatus && (
        <p className="city-message" role="status">
          Payment status: <strong>{orderStatus.replaceAll("_", " ")}</strong>.
          {" "}
          {["checkout", "pending", "created"].includes(orderStatus)
            ? "Your position updates after payment confirmation."
            : ""}
        </p>
      )}
      {business && snapshot?.marketEnabled && (
        <MerchantPosition
          businessId={business.id}
          revision={snapshot.revision}
        />
      )}
      <div className="city-management-grid">
        <form onSubmit={save} className="city-editor">
          <div className="city-section-heading">
            <span>01 / YOUR BUSINESS</span>
            <span className="city-status">
              {business?.status || "New property"}
            </span>
          </div>
          <label>
            Business website
            <div className="city-input-action">
              <input
                type="url"
                aria-label="Business website"
                required
                placeholder="https://your-business.com"
                value={profile.website}
                onChange={(e) => field("website", e.target.value)}
              />
              <button
                type="button"
                disabled={!!busy || !snapshot?.onboardingEnabled}
                onClick={() =>
                  run("import", async () => {
                    const imported = await cityCommand<Partial<CityProfile>>(
                      "import",
                      { website: profile.website },
                    );
                    setProfile((p) => ({ ...p, ...imported }));
                    setMessage(
                      "Website details imported. Review them before saving.",
                    );
                  })}
              >
                {busy === "import" ? "Importing…" : "Import details"}
              </button>
            </div>
          </label>
          <div className="city-field-pair">
            <label>
              Business name
              <input
                required
                maxLength={80}
                value={profile.name}
                onChange={(e) => {
                  field("name", e.target.value);
                  if (!business) {
                    setSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, "")
                        .slice(0, 48),
                    );
                  }
                }}
              />
            </label>
            <label>
              Category
              <select
                value={profile.category}
                onChange={(e) => field("category", e.target.value)}
              >
                {[
                  "Shopping",
                  "AI",
                  "Games",
                  "Apps",
                  "Food",
                  "Travel",
                  "SaaS",
                  "Creators",
                  "Entertainment",
                  "Finance",
                  "Local",
                ].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <label>
            Property address
            <input
              aria-label="Property address"
              required
              disabled={!!business}
              pattern="[a-z0-9][a-z0-9-]{2,47}"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <small>/city/business/{slug || "your-name"}</small>
          </label>
          <label>
            Tagline
            <input
              maxLength={140}
              value={profile.tagline}
              onChange={(e) => field("tagline", e.target.value)}
            />
          </label>
          <label>
            About your business
            <textarea
              maxLength={1200}
              rows={4}
              value={profile.description}
              onChange={(e) => field("description", e.target.value)}
            />
          </label>
          <label>
            Brand colour
            <input
              type="color"
              value={profile.color}
              onChange={(e) => field("color", e.target.value)}
            />
          </label>
          <div className="city-upload-row">
            {(["logo", "hero", "billboard", "video"] as const).map((key) => (
              <label className="city-upload" key={key}>
                <UploadSimple size={22} />
                <span>{profile[key] ? `Replace ${key}` : `Upload ${key}`}</span>
                <small>
                  {key === "video"
                    ? "MP4 · up to 20 MB"
                    : "PNG, JPG, WebP · up to 5 MB"}
                </small>
                <input
                  aria-label={`Upload ${key}`}
                  type="file"
                  accept={key === "video"
                    ? "video/mp4"
                    : "image/png,image/jpeg,image/webp"}
                  disabled={!!busy || !snapshot?.onboardingEnabled}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      void run("upload", async () => {
                        if (
                          file.size > (key === "video" ? 20_000_000 : 5_000_000)
                        ) {
                          throw new Error("File exceeds the upload limit.");
                        }
                        const base64 = await new Promise<string>(
                          (resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () =>
                              resolve(String(reader.result).split(",")[1]);
                            reader.onerror = () =>
                              reject(new Error("Unable to read file."));
                            reader.readAsDataURL(file);
                          },
                        );
                        const uploaded = await cityCommand<{
                          path: string;
                          url: string;
                        }>("upload", { base64 });
                        field(key, uploaded.path);
                        if (key === "billboard") {
                          field("billboardCrop", defaultBillboardCrop);
                        }
                        setPreviews((p) => ({ ...p, [key]: uploaded.url }));
                      });
                    }
                  }}
                />
                {(previews[key] || business?.preview?.[key]) &&
                  key !== "video" && (
                  <img
                    src={previews[key] || business?.preview?.[key]}
                    alt={`${key} preview`}
                  />
                )}
              </label>
            ))}
          </div>
          <fieldset className="city-crop-controls">
            <legend>Billboard composition</legend>
            <CityBillboardArtwork profile={previewProfile} />
            <p>
              Use a dedicated image or your hero image. The sign is 2:1; your
              logo and name stay overlaid.
            </p>
            {(
              [
                ["x", "Horizontal position", 0, 100, 1],
                ["y", "Vertical position", 0, 100, 1],
                ["zoom", "Image zoom", 1, 3, 0.05],
              ] as const
            ).map(([key, label, min, max, step]) => (
              <label key={key}>
                {label}
                <input
                  aria-label={label}
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={(profile.billboardCrop || defaultBillboardCrop)[key]}
                  onChange={(e) =>
                    field("billboardCrop", {
                      ...(profile.billboardCrop || defaultBillboardCrop),
                      [key]: Number(e.target.value),
                    })}
                />
                <output>
                  {(profile.billboardCrop || defaultBillboardCrop)[key]}
                  {key === "zoom" ? "x" : "%"}
                </output>
              </label>
            ))}
            <button
              type="button"
              onClick={() => field("billboardCrop", defaultBillboardCrop)}
            >
              Reset crop
            </button>
            {profile.billboard && (
              <button
                type="button"
                onClick={() => {
                  field("billboard", "");
                  field("billboardCrop", defaultBillboardCrop);
                  setPreviews((p) => ({ ...p, billboard: "" }));
                }}
              >
                Use hero image instead
              </button>
            )}
          </fieldset>
          {snapshot?.discoveryEnabled && !profile.campus && (
            <CitySampleEditor
              value={profile.sample}
              preview={business?.preview?.sample}
              disabled={!!busy || !snapshot?.onboardingEnabled}
              onChange={(sample) => field("sample", sample)}
            />
          )}
          <div className="city-section-heading">
            <span>02 / GIVE PEOPLE A REASON TO VISIT</span>
          </div>
          <label>
            Offer title
            <input
              maxLength={100}
              placeholder="Your city-exclusive welcome offer"
              value={profile.offer.title}
              onChange={(e) =>
                field("offer", { ...profile.offer, title: e.target.value })}
            />
          </label>
          <label>
            Offer details
            <textarea
              maxLength={500}
              value={profile.offer.description}
              onChange={(e) =>
                field("offer", {
                  ...profile.offer,
                  description: e.target.value,
                })}
            />
          </label>
          <div className="city-field-pair">
            <label>
              Voucher code
              <input
                maxLength={80}
                value={profile.offer.code}
                onChange={(e) =>
                  field("offer", { ...profile.offer, code: e.target.value })}
              />
            </label>
            <label>
              Expires (UTC)
              <input
                type="datetime-local"
                value={profile.offer.expiresAt?.slice(0, 16) || ""}
                onChange={(e) =>
                  field("offer", {
                    ...profile.offer,
                    expiresAt: e.target.value
                      ? new Date(`${e.target.value}Z`).toISOString()
                      : null,
                  })}
              />
            </label>
          </div>
          <label>
            Offer destination
            <input
              type="url"
              value={profile.offer.url}
              onChange={(e) =>
                field("offer", { ...profile.offer, url: e.target.value })}
            />
          </label>
          <button
            className="city-primary"
            disabled={!!busy || !snapshot?.onboardingEnabled}
          >
            {busy === "save" ? "Saving…" : "Save property draft"}
          </button>
          {!snapshot?.onboardingEnabled && (
            <p>Business onboarding is currently paused.</p>
          )}
        </form>
        <aside className="city-business-aside">
          <CityBrandPreview
            id={business?.id}
            tier={buildingTier(nextValue)}
            profile={previewProfile}
          />
          {business && (
            <section className="city-business-section">
              <h2>Verify & publish</h2>
              {business.verified_at
                ? (
                  <p>
                    <CheckCircle size={18} /> Website verified
                  </p>
                )
                : (
                  <>
                    <p>
                      Add this TXT record to{" "}
                      <strong>
                        _synarc-city.
                        {(() => {
                          try {
                            return new URL(profile.website).hostname;
                          } catch {
                            return "your-domain";
                          }
                        })()}
                      </strong>
                      , or place the value at{" "}
                      <code>/.well-known/synarc-city.txt</code>.
                    </p>
                    <code className="city-token">
                      synarc-city={business.verification_token}
                    </code>
                    <button
                      disabled={!!busy || dirty}
                      onClick={() =>
                        run("verify", async () => {
                          await cityCommand("verify", {
                            businessId: business.id,
                          });
                          await onRefresh();
                        })}
                    >
                      {busy === "verify"
                        ? "Checking…"
                        : "Check website verification"}
                    </button>
                  </>
                )}
              {dirty && (
                <p>Save your changes before verification or submission.</p>
              )}
              {business.review_note && (
                <p>Review note: {business.review_note}</p>
              )}
              <button
                disabled={!!busy ||
                  dirty ||
                  !business.verified_at ||
                  business.status === "pending" ||
                  business.status === "suspended"}
                onClick={() =>
                  run("submit", async () => {
                    await cityCommand("submit", {
                      businessId: business.id,
                      version: business.draft_version,
                    });
                    await onRefresh();
                  })}
              >
                {business.status === "pending"
                  ? "Waiting for review"
                  : "Submit for review"}
              </button>
            </section>
          )}
          <section id="city-next-move" className="city-business-section">
            <span className="city-eyebrow">YOUR NEXT MOVE</span>
            <h2>Move closer to the centre.</h2>
            <p>
              Your current City Value{" "}
              <strong>{formatGBP(Number(business?.land_value || 0))}</strong>
            </p>
            <label>
              Add City Value (£)
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <p>
              New total <strong>{formatGBP(nextValue)}</strong>
            </p>
            {snapshot?.marketEnabled && (
              <QuotePreview quote={quote} onAmount={setAmount} />
            )}
            <small>
              Positions are estimates. Other businesses may purchase before your
              payment completes. Tax, where applicable, is added at checkout.
            </small>
            <label className="city-checkbox">
              <input
                type="checkbox"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
              />
              I understand this buys movable sponsored placement, with no fixed
              plot or guaranteed traffic.
            </label>
            {snapshot?.termsUrl && (
              <a
                href={snapshot.termsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Purchase terms and refund policy
              </a>
            )}
            <button
              className="city-primary"
              disabled={!!busy ||
                !terms ||
                !business?.published ||
                business.status === "suspended" ||
                !snapshot?.purchasesEnabled ||
                (!!snapshot?.marketEnabled &&
                  (!quote || quote.amount !== pennies))}
              onClick={() =>
                run("checkout", async () => {
                  const purchase = parsePurchase(amount);
                  if (snapshot?.marketEnabled) {
                    const fresh = await marketQuote(business!.id, purchase);
                    const changed = !quote ||
                      fresh.rank !== quote.rank ||
                      fresh.tier !== quote.tier ||
                      fresh.currentValue !== quote.currentValue;
                    setQuote(fresh);
                    if (changed) {
                      throw new Error(
                        "The market changed. Review the updated position estimate, then continue.",
                      );
                    }
                  }
                  const storageKey = `city-checkout:${
                    business!.id
                  }:${purchase}`;
                  let requestKey = sessionStorage.getItem(storageKey);
                  if (!requestKey) {
                    requestKey = crypto.randomUUID();
                    sessionStorage.setItem(storageKey, requestKey);
                  }
                  const checkout = await cityCommand<{ url: string }>(
                    "checkout",
                    {
                      businessId: business!.id,
                      amount: purchase,
                      requestKey,
                      termsVersion: "city-1",
                    },
                  );
                  window.location.assign(checkout.url);
                })}
            >
              Continue to secure checkout <ArrowUpRight size={18} />
            </button>
            {!snapshot?.purchasesEnabled && <p>Payments are not open yet.</p>}
          </section>
        </aside>
      </div>
      {business && snapshot?.customerDiscoveryEnabled && (
        <CustomerMetrics businessId={business.id} />
      )}
      {business && snapshot?.dealsEnabled && (
        <CityDealStudio businessId={business.id} />
      )}
      {business && snapshot?.campusEnabled && (
        <CityCampusEditor business={business} onRefresh={onRefresh} />
      )}
      {business?.published && snapshot?.discoveryEnabled && (
        <CityDiscoveryStudio businessId={business.id} />
      )}
      {business && (
        <section className="city-analytics">
          <div className="city-section-heading">
            <span>03 / YOUR PROPERTY IN NUMBERS</span>
            <small>
              Views are deduplicated daily. Claims are not verified purchases.
            </small>
          </div>
          <div className="city-metrics">
            {["views", "clicks", "saves", "claims", "shares"].map((metric) => (
              <div key={metric}>
                <strong>{workspace.analytics[metric] || 0}</strong>
                <span>{metric}</span>
              </div>
            ))}
          </div>
          <h2>Last 30 days</h2>
          <div className="city-metrics">
            {Object.entries({
              views30d: "Property views",
              clicks30d: "Website clicks",
              claims30d: "Offer claims",
              signedInVisitors30d: "Signed-in visitors",
              returningVisitors30d: "Returning signed-in visitors",
            }).map(([key, label]) => (
              <div key={key}>
                <strong>{workspace.analytics[key] || 0}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p>
            Returning means visiting this property on at least two different UTC
            days. Only signed-in visitors are counted; your own visits are
            excluded. Offer claims do not confirm sales.
          </p>
          <h2>Payment history</h2>
          {workspace.orders.length
            ? (
              <div className="city-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>City Value purchase</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.orders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          {new Date(order.created_at).toLocaleDateString(
                            "en-GB",
                          )}
                        </td>
                        <td>{formatGBP(Number(order.amount))}</td>
                        <td>{order.status.replaceAll("_", " ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
            : <p>Your confirmed purchases will appear here.</p>}
          <h2>Rank history</h2>
          {workspace.history.map((item) => (
            <p key={item.id}>
              {new Date(item.createdAt).toLocaleDateString("en-GB")} ·{" "}
              {item.fromRank ? `#${item.fromRank} → ` : "Arrived at "}#
              {item.toRank}{" "}
              <a
                href={`/api/city-share?eventId=${item.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Share this moment
              </a>
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
