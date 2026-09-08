"use client";

// Live calibration tool for the Classic Frame border pieces used by
// app/irish-census/design/page.tsx's poster preview (4 edge strips + 4 corner
// squares, cropped from the real product photos in
// public/artwork/Frames/Classic Frames/). Pick a colour, drag its 8 crop sliders
// (left/right/top/bottom x outer/inner — see lib/design/frameBorder.ts for what
// those mean) until the live preview's frame looks right, then Save: that writes
// data/frame-border-calibration.json AND re-bakes all 64 crop PNGs straight into
// public/artwork/Frames/Classic Frames/border-crops/, from the same canvases the
// preview below is already drawing — no separate script run needed.
//
// Two previews are shown side by side, Square and ISO (portrait) — the two aspect
// ratios the designer actually ships — each with its own border-thickness-% setting
// (thickness is a % of on-screen width in both, matching the real designer's own
// formula) and a hard red box marking exactly where the artwork/poster sits, so a
// stretch/alignment problem that only shows up in one format is easy to catch here
// rather than after it's live.
//
// Gated the same way as /admin/mockup-calibration: a shared admin token exchanged
// once for an httpOnly session cookie (lib/admin-auth.ts) — no per-user accounts on
// this site. Meant to be run against a LOCAL dev server: the API route writes
// straight to disk (data/ and public/), which only works on a machine you're
// developing on, not the deployed Vercel site (read-only filesystem there).

import { useCallback, useEffect, useRef, useState } from "react";

import {
  FRAME_BORDER_PIECES,
  frameBorderPieceStyle,
  frameCropSourceRect,
  FRAME_EDGE_BAKE_SIZE,
  FRAME_CORNER_BAKE_SIZE,
  type FrameBorderCalibration,
  type FrameColourCalibration,
  type FrameBorderPiece,
} from "@/lib/design/frameBorder";

const INK = "#1e2b18";
const RAISED = "#fdfaf5";
const GROUND = "#fdfaf5";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";
const STATUS_CRITICAL = "#b3452b";
const STATUS_OK = "#3f7d4a";

const EDGE_KEYS = ["left", "right", "top", "bottom"] as const;
type EdgeKey = (typeof EDGE_KEYS)[number];
const EDGE_LABELS: Record<EdgeKey, string> = { left: "Left", right: "Right", top: "Top", bottom: "Bottom" };

const PREVIEW_WIDTH_PX = 300;

function labelFor(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isCornerPiece(piece: FrameBorderPiece): boolean {
  return piece === "tl" || piece === "tr" || piece === "bl" || piece === "br";
}

function isVerticalEdgePiece(piece: FrameBorderPiece): boolean {
  return piece === "left" || piece === "right";
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

/** Draws one piece's current crop, at its baked resolution, from `img` into `canvas`. */
function drawPiece(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  calib: FrameColourCalibration,
  piece: FrameBorderPiece
) {
  const bake = isCornerPiece(piece) ? FRAME_CORNER_BAKE_SIZE : FRAME_EDGE_BAKE_SIZE;
  const width = isCornerPiece(piece) ? bake.w : isVerticalEdgePiece(piece) ? bake.h : bake.w;
  const height = isCornerPiece(piece) ? bake.h : isVerticalEdgePiece(piece) ? bake.w : bake.h;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  const { sx, sy, sw, sh } = frameCropSourceRect(piece, calib, img.naturalWidth, img.naturalHeight);
  if (sw > 0 && sh > 0 && img.naturalWidth > 0) {
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  }
}

function NumberSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between text-xs" style={{ color: MUTED }}>
        <span>{label}</span>
        <span className="font-mono tabular-nums" style={{ color: INK }}>
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1 w-full"
      />
    </label>
  );
}

/** One live-composited frame border (8 canvases + a hard red "artwork goes here"
 * box), at a given aspect and thickness — the Square and ISO previews are two of
 * these, sharing the same crop calibration but their own thickness setting. */
function FramePreview({
  img,
  calib,
  aspect,
  thicknessPercent,
  cornerOverlapPx,
}: {
  img: HTMLImageElement | null;
  calib: FrameColourCalibration;
  aspect: "square" | "iso";
  thicknessPercent: number;
  cornerOverlapPx: number;
}) {
  const canvasRefs = useRef<Partial<Record<FrameBorderPiece, HTMLCanvasElement | null>>>({});
  const boxHeightPx = aspect === "square" ? PREVIEW_WIDTH_PX : Math.round(PREVIEW_WIDTH_PX * Math.SQRT2);
  const thicknessPx = Math.round((PREVIEW_WIDTH_PX * thicknessPercent) / 100);

  useEffect(() => {
    if (!img) return;
    for (const piece of FRAME_BORDER_PIECES) {
      const canvas = canvasRefs.current[piece];
      if (canvas) drawPiece(canvas, img, calib, piece);
    }
  }, [img, calib]);

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-sm shadow-md"
        style={{ width: PREVIEW_WIDTH_PX, height: boxHeightPx, background: "#e5e0d8" }}
      >
        {FRAME_BORDER_PIECES.map((piece) => (
          <div key={piece} style={frameBorderPieceStyle(piece, thicknessPx, cornerOverlapPx)}>
            <canvas
              ref={(el) => {
                canvasRefs.current[piece] = el;
              }}
              className="h-full w-full"
            />
          </div>
        ))}
        {/* Hard red box: exactly where the artwork/poster content sits in the real
            designer (posterRef there is inset by this same frameThicknessPx). */}
        <div
          className="pointer-events-none absolute border-[3px] border-red-600"
          style={{ top: thicknessPx, left: thicknessPx, right: thicknessPx, bottom: thicknessPx }}
        />
      </div>
      <p className="mt-2 text-center text-xs font-medium" style={{ color: MUTED }}>
        {aspect === "square" ? "Square" : "ISO (portrait)"} — {thicknessPercent.toFixed(1)}% border
      </p>
    </div>
  );
}

export default function FrameCalibrationPage() {
  const [tokenInput, setTokenInput] = useState("");
  const [state, setState] = useState<"gate" | "loading" | "error" | "ready">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const [calibration, setCalibration] = useState<FrameBorderCalibration | null>(null);
  const [selectedId, setSelectedId] = useState<string>("black");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");

  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const [swatchImgs, setSwatchImgs] = useState<Record<string, HTMLImageElement>>({});

  const loadAll = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/admin/frame-calibration");
      if (!res.ok) {
        setState("gate");
        return;
      }
      const body = (await res.json()) as { calibration: FrameBorderCalibration };
      setCalibration(body.calibration);
      setSelectedId((prev) =>
        body.calibration.frames.some((f) => f.id === prev) ? prev : (body.calibration.frames[0]?.id ?? "black")
      );
      setDirty(false);
      setState("ready");
    } catch {
      setErrorMsg("Could not reach the server.");
      setState("gate");
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Load every colour's source photo once, for the swatch strip and so Save can bake
  // all 8 colours' crops without a per-colour loading round-trip.
  useEffect(() => {
    if (!calibration) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        calibration.frames.map(async (f) => {
          try {
            const img = await loadImage(`/artwork/Frames/Classic Frames/${f.file}`);
            return [f.id, img] as const;
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      const map: Record<string, HTMLImageElement> = {};
      for (const entry of entries) if (entry) map[entry[0]] = entry[1];
      setSwatchImgs(map);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- frames only change identity on load/save, not per-slider-edit
    })();
    return () => {
      cancelled = true;
    };
  }, [calibration?.frames.length]);

  useEffect(() => {
    setSelectedImg(swatchImgs[selectedId] ?? null);
  }, [swatchImgs, selectedId]);

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

  function updateEdge(edge: EdgeKey, field: "outer" | "inner", value: number) {
    setCalibration((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        frames: prev.frames.map((f) =>
          f.id === selectedId ? { ...f, [edge]: { ...f[edge], [field]: value } } : f
        ),
      };
    });
    setDirty(true);
    setSaveMessage("");
  }

  function updateCornerOverlap(value: number) {
    setCalibration((prev) => (prev ? { ...prev, cornerOverlapPx: value } : prev));
    setDirty(true);
    setSaveMessage("");
  }

  function updateThickness(format: "square" | "iso", value: number) {
    setCalibration((prev) =>
      prev ? { ...prev, borderThicknessPercent: { ...prev.borderThicknessPercent, [format]: value } } : prev
    );
    setDirty(true);
    setSaveMessage("");
  }

  async function handleSave() {
    if (!calibration) return;
    setSaving(true);
    setSaveError("");
    setSaveMessage("");
    try {
      const crops: { id: string; piece: string; dataUrl: string }[] = [];
      for (const frame of calibration.frames) {
        const img = swatchImgs[frame.id] ?? (await loadImage(`/artwork/Frames/Classic Frames/${frame.file}`));
        for (const piece of FRAME_BORDER_PIECES) {
          const canvas = document.createElement("canvas");
          drawPiece(canvas, img, frame, piece);
          crops.push({ id: frame.id, piece, dataUrl: canvas.toDataURL("image/png") });
        }
      }
      const res = await fetch("/api/admin/frame-calibration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calibration, crops }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError(body.error || "Could not save.");
        return;
      }
      const body = (await res.json()) as { cropsWritten: number };
      setDirty(false);
      setSaveMessage(
        `Saved — ${body.cropsWritten} crop files regenerated in public/artwork/. The real designer picks those up immediately; a thickness or corner-overlap change also needs the dev server restarted (they're compiled into the page, not read from disk at runtime).`
      );
    } catch {
      setSaveError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
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
          <h1 className="mt-2 text-2xl font-medium">Frame calibration</h1>
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

  if (!calibration) return null;
  const selected = calibration.frames.find((f) => f.id === selectedId) ?? calibration.frames[0];

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
            <h1 className="mt-2 text-3xl font-medium">Frame calibration</h1>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: MUTED }}>
              Pick a colour, drag its crop sliders until the live preview&apos;s frame looks right in
              both formats, then Save. The red box is exactly where the artwork/poster sits.
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

        {/* Colour picker */}
        <div className="mt-8 flex flex-wrap gap-2">
          {calibration.frames.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelectedId(f.id)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm"
              style={{
                border: `1px solid ${f.id === selectedId ? INK : RULE}`,
                background: RAISED,
                boxShadow: f.id === selectedId ? `0 0 0 1px ${INK}` : "none",
              }}
            >
              <span
                className="block h-6 w-6 overflow-hidden rounded-sm"
                style={{
                  backgroundImage: `url(/artwork/Frames/Classic Frames/${f.file})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  border: `1px solid ${RULE}`,
                }}
              />
              {labelFor(f.id)}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[340px_1fr]">
          {/* Sliders */}
          <div className="rounded-lg p-6" style={{ background: RAISED, border: `1px solid ${RULE}` }}>
            <h2 className="text-sm font-semibold">{labelFor(selected.id)} — crop calibration</h2>
            <p className="mt-1 text-xs" style={{ color: MUTED }}>
              Outer: where the backdrop margin ends. Inner: where the moulding ends and the
              opening begins. Both walk in from that edge, as a % of the photo&apos;s own size.
            </p>

            <div className="mt-4 space-y-5">
              {EDGE_KEYS.map((edge) => (
                <div key={edge}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: INK }}>
                    {EDGE_LABELS[edge]}
                  </p>
                  <div className="mt-2 space-y-3">
                    <NumberSlider
                      label="Outer"
                      value={selected[edge].outer}
                      min={0}
                      max={0.35}
                      step={0.0005}
                      onChange={(v) => updateEdge(edge, "outer", v)}
                      format={(v) => `${(v * 100).toFixed(2)}%`}
                    />
                    <NumberSlider
                      label="Inner"
                      value={selected[edge].inner}
                      min={0}
                      max={0.35}
                      step={0.0005}
                      onChange={(v) => updateEdge(edge, "inner", v)}
                      format={(v) => `${(v * 100).toFixed(2)}%`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 border-t pt-5" style={{ borderColor: RULE }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: INK }}>
                Shared (all colours)
              </p>
              <div className="mt-2 space-y-3">
                <NumberSlider
                  label="Corner overlap"
                  value={calibration.cornerOverlapPx}
                  min={0}
                  max={10}
                  step={0.5}
                  onChange={updateCornerOverlap}
                  format={(v) => `${v.toFixed(1)}px`}
                />
                <NumberSlider
                  label="Border thickness — Square"
                  value={calibration.borderThicknessPercent.square}
                  min={1}
                  max={8}
                  step={0.1}
                  onChange={(v) => updateThickness("square", v)}
                  format={(v) => `${v.toFixed(1)}%`}
                />
                <NumberSlider
                  label="Border thickness — ISO"
                  value={calibration.borderThicknessPercent.iso}
                  min={1}
                  max={8}
                  step={0.1}
                  onChange={(v) => updateThickness("iso", v)}
                  format={(v) => `${v.toFixed(1)}%`}
                />
              </div>
            </div>

            {saveError ? (
              <p className="mt-4 text-sm" style={{ color: STATUS_CRITICAL }}>
                {saveError}
              </p>
            ) : null}
            {saveMessage ? (
              <p className="mt-4 text-sm" style={{ color: STATUS_OK }}>
                {saveMessage}
              </p>
            ) : null}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-5 w-full rounded-md px-5 py-2.5 text-sm font-medium transition-opacity disabled:opacity-60"
              style={{ background: INK, color: RAISED }}
            >
              {saving ? "Baking & saving…" : dirty ? "Save & regenerate crops" : "Save & regenerate crops (no changes)"}
            </button>
          </div>

          {/* Live preview */}
          <div className="rounded-lg p-6" style={{ background: RAISED, border: `1px solid ${RULE}` }}>
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: MUTED }}>
              Live preview
            </p>
            <div className="mt-4 flex flex-wrap items-start justify-center gap-10">
              <FramePreview
                img={selectedImg}
                calib={selected}
                aspect="square"
                thicknessPercent={calibration.borderThicknessPercent.square}
                cornerOverlapPx={calibration.cornerOverlapPx}
              />
              <FramePreview
                img={selectedImg}
                calib={selected}
                aspect="iso"
                thicknessPercent={calibration.borderThicknessPercent.iso}
                cornerOverlapPx={calibration.cornerOverlapPx}
              />
            </div>
            {!selectedImg && (
              <p className="mt-4 text-center text-xs" style={{ color: MUTED }}>
                Loading {labelFor(selected.id)}&apos;s source photo…
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
