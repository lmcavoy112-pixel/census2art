"use client";

// Calibration tool for the "Preview on a wall" designer feature and /gallery.
//
// Upload a wall-scenario photo once per SKU, click its artwork region's 4 corners
// (in order: top-left, top-right, bottom-right, bottom-left), drag to fine-tune, and
// save — the designer and gallery then warp any artwork into that same quad forever,
// with no further work per size. See lib/mockup/* for the warp math and
// supabase/migrations/0014_mockup_templates.sql for the stored shape.
//
// Gated the same way as /admin/orders: a shared admin token exchanged once for an
// httpOnly session cookie (lib/admin-auth.ts) — no per-user accounts on this site.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadCatalogueSkus, type CatalogueSku } from "@/lib/design/catalogue";
import MockupComposite from "@/lib/mockup/MockupComposite";
import type { MockupProduct, MockupTemplateRecord, Point, Quad } from "@/lib/mockup/types";

const INK = "#1e2b18";
const RAISED = "#fdfaf5";
const GROUND = "#fdfaf5";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";
const STATUS_CRITICAL = "#b3452b";

const PRODUCTS: MockupProduct[] = ["Classic Frame", "Stretched Canvas"];
const CORNER_LABELS = ["Top-left", "Top-right", "Bottom-right", "Bottom-left"];
const PLACEHOLDER_ARTWORK = "/examples/gallery-modern/Byrne_house.png";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export default function MockupCalibrationPage() {
  const [tokenInput, setTokenInput] = useState("");
  const [state, setState] = useState<"gate" | "loading" | "error" | "ready">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const [templates, setTemplates] = useState<MockupTemplateRecord[]>([]);
  const [catalogueSkus, setCatalogueSkus] = useState<CatalogueSku[]>([]);

  const [product, setProduct] = useState<MockupProduct>("Stretched Canvas");
  const [sku, setSku] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [corners, setCorners] = useState<Point[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const imageBoxRef = useRef<HTMLDivElement | null>(null);

  const loadAll = useCallback(async () => {
    setState("loading");
    try {
      const [templatesRes, skus] = await Promise.all([
        fetch("/api/admin/mockup-templates"),
        loadCatalogueSkus(),
      ]);
      if (!templatesRes.ok) {
        setState("gate");
        return;
      }
      const body = (await templatesRes.json()) as { templates: MockupTemplateRecord[] };
      setTemplates(body.templates ?? []);
      setCatalogueSkus(skus.filter((s) => s.product === "Classic Frame" || s.product === "Stretched Canvas"));
      setState("ready");
    } catch {
      setErrorMsg("Could not reach the server.");
      setState("gate");
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    const candidateToken = tokenInput.trim();
    if (!candidateToken) return;

    setState("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: candidateToken }),
      });
      if (!res.ok) {
        setErrorMsg(res.status === 404 ? "That token wasn't recognised." : "Could not sign in.");
        setState("gate");
        return;
      }
      setTokenInput("");
      await loadAll();
    } catch {
      setErrorMsg("Could not reach the server.");
      setState("gate");
    }
  }

  function signOut() {
    fetch("/api/admin/login", { method: "DELETE" }).catch(() => {});
    setState("gate");
  }

  const skuOptions = useMemo(
    () => catalogueSkus.filter((s) => s.product === product).sort((a, b) => a.short_in - b.short_in),
    [catalogueSkus, product]
  );

  function resetForm() {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setNatural(null);
    setCorners([]);
    setNotes("");
    setSaveError("");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(chosen);
    setNatural(null);
    setCorners([]);
    setSaveError("");
    setPreviewUrl(chosen ? URL.createObjectURL(chosen) : null);
  }

  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (corners.length >= 4 || dragIndex !== null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    setCorners((prev) => [...prev, { x, y }]);
  }

  useEffect(() => {
    if (dragIndex === null) return;

    function onMove(event: PointerEvent) {
      const box = imageBoxRef.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      const x = clamp01((event.clientX - rect.left) / rect.width);
      const y = clamp01((event.clientY - rect.top) / rect.height);
      setCorners((prev) => prev.map((p, i) => (i === dragIndex ? { x, y } : p)));
    }
    function onUp() {
      setDragIndex(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragIndex]);

  const quad: Quad | null = corners.length === 4 ? (corners as Quad) : null;

  async function handleSave() {
    if (!file || !natural || !quad || !sku) return;
    setSaving(true);
    setSaveError("");
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("sku", sku);
      formData.append("product", product);
      formData.append("imageWidth", String(natural.w));
      formData.append("imageHeight", String(natural.h));
      formData.append("quad", JSON.stringify(quad));
      if (notes) formData.append("notes", notes);

      const res = await fetch("/api/admin/mockup-templates", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError(body.error || "Could not save this template.");
        return;
      }
      resetForm();
      await loadAll();
    } catch {
      setSaveError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this calibrated template?")) return;
    const res = await fetch(`/api/admin/mockup-templates/${id}`, { method: "DELETE" });
    if (res.ok) setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  if (state === "gate" || state === "loading") {
    return (
      <div
        style={{ background: GROUND, color: INK, minHeight: "100vh" }}
        className="flex items-center justify-center px-6"
      >
        <form
          onSubmit={handleUnlock}
          className="w-full max-w-sm rounded-lg p-8"
          style={{ background: RAISED, border: `1px solid ${RULE}` }}
        >
          <p
            style={{
              fontFamily: "var(--font-plex-mono, monospace)",
              fontSize: "0.68rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: GOLD,
            }}
          >
            Internal
          </p>
          <h1 className="mt-2 text-2xl font-medium">Mockup calibration</h1>
          <p className="mt-3 text-sm" style={{ color: MUTED }}>
            Enter the admin token to continue.
          </p>
          <input
            type="password"
            autoFocus
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Admin token"
            className="mt-5 w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{ border: `1px solid ${RULE}`, background: RAISED, color: INK }}
          />
          {errorMsg ? (
            <p className="mt-2 text-sm" style={{ color: STATUS_CRITICAL }}>
              {errorMsg}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={state === "loading"}
            className="mt-5 w-full rounded-md py-2.5 text-sm font-medium transition-opacity disabled:opacity-60"
            style={{ background: INK, color: RAISED }}
          >
            {state === "loading" ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ background: GROUND, color: INK, minHeight: "100vh" }}>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              style={{
                fontFamily: "var(--font-plex-mono, monospace)",
                fontSize: "0.68rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: GOLD,
              }}
            >
              Internal
            </p>
            <h1 className="mt-2 text-3xl font-medium">Mockup calibration</h1>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: MUTED }}>
              Upload a wall-scenario photo, click its artwork region&apos;s four corners in order
              (top-left, top-right, bottom-right, bottom-left), then save. Colour is not
              modelled per-SKU — one representative colour (e.g. Black) is enough for Classic
              Frame.
            </p>
          </div>
          <button
            onClick={signOut}
            className="shrink-0 rounded-md px-4 py-2 text-sm"
            style={{ border: `1px solid ${RULE}`, color: MUTED }}
          >
            Sign out
          </button>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          {/* Calibration form */}
          <div className="rounded-lg p-6" style={{ background: RAISED, border: `1px solid ${RULE}` }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: MUTED }}>
                  Product
                </label>
                <select
                  value={product}
                  onChange={(e) => {
                    setProduct(e.target.value as MockupProduct);
                    setSku("");
                  }}
                  className="mt-1 w-full rounded-md px-3 py-2 text-sm"
                  style={{ border: `1px solid ${RULE}`, background: RAISED, color: INK }}
                >
                  {PRODUCTS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide" style={{ color: MUTED }}>
                  Size (SKU)
                </label>
                <select
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className="mt-1 w-full rounded-md px-3 py-2 text-sm"
                  style={{ border: `1px solid ${RULE}`, background: RAISED, color: INK }}
                >
                  <option value="">Choose a size…</option>
                  {skuOptions.map((s) => (
                    <option key={s.sku} value={s.sku}>
                      {s.size_label} ({s.sku})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-medium uppercase tracking-wide" style={{ color: MUTED }}>
                Scenario photo
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleFileChange}
                className="mt-1 block w-full text-sm"
              />
            </div>

            {previewUrl && (
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs" style={{ color: MUTED }}>
                    {corners.length < 4
                      ? `Click to place: ${CORNER_LABELS[corners.length]}`
                      : "Drag any dot to adjust."}
                  </p>
                  {corners.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCorners([])}
                      className="text-xs underline"
                      style={{ color: MUTED }}
                    >
                      Reset corners
                    </button>
                  )}
                </div>
                <div
                  ref={imageBoxRef}
                  onClick={handleImageClick}
                  className="relative mt-2 select-none overflow-hidden rounded-md"
                  style={{ border: `1px solid ${RULE}`, cursor: corners.length < 4 ? "crosshair" : "default" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Scenario photo being calibrated"
                    className="block w-full"
                    draggable={false}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
                    }}
                  />
                  {corners.length > 1 && (
                    <svg
                      className="pointer-events-none absolute inset-0 h-full w-full"
                      viewBox="0 0 1 1"
                      preserveAspectRatio="none"
                    >
                      <polygon
                        points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="rgba(184,144,42,0.18)"
                        stroke={GOLD}
                        strokeWidth={0.004}
                      />
                    </svg>
                  )}
                  {corners.map((p, i) => (
                    <div
                      key={i}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDragIndex(i);
                      }}
                      title={CORNER_LABELS[i]}
                      className="absolute flex items-center justify-center rounded-full text-[10px] font-semibold"
                      style={{
                        left: `${p.x * 100}%`,
                        top: `${p.y * 100}%`,
                        width: 20,
                        height: 20,
                        marginLeft: -10,
                        marginTop: -10,
                        background: GOLD,
                        color: INK,
                        border: `2px solid ${RAISED}`,
                        cursor: "grab",
                        touchAction: "none",
                      }}
                    >
                      {i + 1}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4">
              <label className="text-xs font-medium uppercase tracking-wide" style={{ color: MUTED }}>
                Notes (optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. living room, oak floor"
                className="mt-1 w-full rounded-md px-3 py-2 text-sm"
                style={{ border: `1px solid ${RULE}`, background: RAISED, color: INK }}
              />
            </div>

            {saveError && (
              <p className="mt-3 text-sm" style={{ color: STATUS_CRITICAL }}>
                {saveError}
              </p>
            )}

            <button
              type="button"
              disabled={!file || !natural || !quad || !sku || saving}
              onClick={handleSave}
              className="mt-5 rounded-md px-5 py-2.5 text-sm font-medium transition-opacity disabled:opacity-40"
              style={{ background: INK, color: RAISED }}
            >
              {saving ? "Saving…" : "Save template"}
            </button>
          </div>

          {/* Live preview */}
          <div className="rounded-lg p-6" style={{ background: RAISED, border: `1px solid ${RULE}` }}>
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: MUTED }}>
              Live preview
            </p>
            <p className="mt-1 text-xs" style={{ color: MUTED }}>
              A sample artwork, warped into the quad above — exactly what the designer will show.
            </p>
            <div className="mt-3">
              {previewUrl && natural && quad ? (
                <MockupComposite
                  templateImageUrl={previewUrl}
                  templateWidth={natural.w}
                  templateHeight={natural.h}
                  quad={quad}
                  artworkSrc={PLACEHOLDER_ARTWORK}
                  className="rounded-md"
                />
              ) : (
                <div
                  className="flex aspect-square items-center justify-center rounded-md text-xs"
                  style={{ background: GROUND, border: `1px dashed ${RULE}`, color: MUTED }}
                >
                  Upload a photo and place all 4 corners
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Existing templates */}
        <div className="mt-10">
          <h2 className="text-lg font-medium">Calibrated sizes ({templates.length})</h2>
          {templates.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: MUTED }}>
              None yet — calibrate your first size above.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="overflow-hidden rounded-lg"
                  style={{ background: RAISED, border: `1px solid ${RULE}` }}
                >
                  <MockupComposite
                    templateImageUrl={t.imageUrl}
                    templateWidth={t.imageWidth}
                    templateHeight={t.imageHeight}
                    quad={t.quad}
                    artworkSrc={PLACEHOLDER_ARTWORK}
                  />
                  <div className="p-3">
                    <p className="text-sm font-medium">{t.sku}</p>
                    <p className="text-xs" style={{ color: MUTED }}>
                      {t.product}
                    </p>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="mt-2 text-xs underline"
                      style={{ color: STATUS_CRITICAL }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
