import { useState } from "react";
import type { CitySample as Sample } from "../../domain/cityDiscovery";
import { cityCommand } from "./api";
export function CitySample({
  sample,
  onEvent = () => {},
}: {
  sample: Sample;
  onEvent?: (kind: "sample_start" | "sample_interaction") => void;
}) {
  const [started, setStarted] = useState(false),
    [index, setIndex] = useState(0),
    [position, setPosition] = useState(50);
  const item = sample.items[Math.min(index, sample.items.length - 1)];
  if (!item) return null;
  const interact = () => {
    if (!started) {
      setStarted(true);
      onEvent("sample_start");
    }
    onEvent("sample_interaction");
  };
  return (
    <section className="city-sample" aria-label="Interactive sample">
      <p className="city-eyebrow">TRY A SAMPLE</p>
      <h3>{sample.title}</h3>
      {sample.kind === "comparison" && !sample.items.every((entry) => entry.image) ? (
        <p>Upload both images to preview this comparison.</p>
      ) : sample.kind === "comparison" ? (
        <>
          <div className="city-comparison">
            <img src={sample.items[1].image} alt={sample.items[1].label} />
            <img
              style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
              src={sample.items[0].image}
              alt={sample.items[0].label}
            />
          </div>
          <label>
            Compare {sample.items[0].label} and {sample.items[1].label}
            <input
              type="range"
              min={0}
              max={100}
              value={position}
              onChange={(e) => {
                setPosition(Number(e.target.value));
                interact();
              }}
            />
          </label>
          <p>
            {sample.items[0].description} {sample.items[1].description}
          </p>
        </>
      ) : (
        <>
          <div className="city-sample-options">
            {sample.items.map((i, n) => (
              <button
                key={n}
                type="button"
                aria-pressed={index === n}
                onClick={() => {
                  setIndex(n);
                  interact();
                }}
              >
                {i.label}
              </button>
            ))}
          </div>
          {item.image && (
            <img
              className="city-sample-image"
              src={item.image}
              alt={item.label}
            />
          )}
          <p>{item.description}</p>
        </>
      )}
      <small>
        Interactive sample supplied by the business. No live AI request.
      </small>
    </section>
  );
}
export async function uploadDiscoveryImage(file: File) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 5_000_000
  )
    throw new Error("Choose a PNG, JPEG or WebP up to 5 MB.");
  const base64 = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Unable to read image"));
    r.readAsDataURL(file);
  });
  return cityCommand<{ path: string; url: string }>("upload", { base64 });
}
export function CitySampleEditor({
  value,
  onChange,
  disabled,
  preview,
}: {
  value: Sample | null | undefined;
  onChange: (s: Sample | null) => void;
  disabled: boolean;
  preview?: Sample | null;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const changeItem = (i: number, patch: Partial<Sample["items"][number]>) => {
    if (value)
      onChange({
        ...value,
        items: value.items.map((v, n) => (n === i ? { ...v, ...patch } : v)),
      });
  };
  return (
    <fieldset className="city-crop-controls" disabled={disabled || busy}>
      <legend>Interactive storefront sample</legend>
      <label>
        Sample template
        <select
          value={value?.kind || ""}
          onChange={(e) =>
            onChange(
              e.target.value
                ? {
                    kind: e.target.value as Sample["kind"],
                    title: value?.title || "Explore our examples",
                    items: (
                      value?.items || [
                        { label: "Before", image: "", description: "" },
                        { label: "After", image: "", description: "" },
                      ]
                    ).slice(0, e.target.value === "comparison" ? 2 : 5),
                  }
                : null,
            )
          }
        >
          <option value="">No sample</option>
          <option value="comparison">Before / after comparison</option>
          <option value="gallery">Selectable examples</option>
          <option value="guided">Guided comparison</option>
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {value && (
        <>
          <label>
            Sample title
            <input
              maxLength={100}
              required
              value={value.title}
              onChange={(e) => onChange({ ...value, title: e.target.value })}
            />
          </label>
          {value.items.map((i, n) => (
            <div className="city-sample-editor-item" key={n}>
              <label>
                Example {n + 1} label
                <input
                  required
                  maxLength={80}
                  value={i.label}
                  onChange={(e) => changeItem(n, { label: e.target.value })}
                />
              </label>
              <label>
                Example {n + 1} explanation
                <textarea
                  maxLength={500}
                  value={i.description}
                  onChange={(e) =>
                    changeItem(n, { description: e.target.value })
                  }
                />
              </label>
              <label>
                Example {n + 1} image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setBusy(true);
                    setError("");
                    try {
                      const r = await uploadDiscoveryImage(f);
                      setUrls((u) => ({ ...u, [r.path]: r.url }));
                      changeItem(n, { image: r.path });
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </label>
              {value.kind !== "comparison" && value.items.length > 2 && (
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...value,
                      items: value.items.filter((_, j) => j !== n),
                    })
                  }
                >
                  Remove example {n + 1}
                </button>
              )}
            </div>
          ))}
          {value.kind !== "comparison" && value.items.length < 5 && (
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  items: [
                    ...value.items,
                    { label: "New example", image: "", description: "" },
                  ],
                })
              }
            >
              Add example
            </button>
          )}
          <CitySample
            key={value.kind}
            sample={{
              ...value,
              items: value.items.map((i, n) => ({
                ...i,
                image: urls[i.image] || preview?.items[n]?.image || "",
              })),
            }}
          />
        </>
      )}
    </fieldset>
  );
}
