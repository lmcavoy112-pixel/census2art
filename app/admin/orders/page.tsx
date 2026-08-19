"use client";

// Internal orders dashboard. Gated by the same shared admin token as the other internal
// order routes (lib/admin-auth.ts) — there is no user auth system on this site, so the
// token is entered once and kept in localStorage rather than a session/cookie.
//
// Palette: reuses the site's own INK/GOLD/RAISED/MUTED tones (see app/page.tsx,
// app/components/home/CensusBlock.tsx) rather than a generic dashboard palette. Bars are
// all magnitude (order count), so they share one sequential hue (GOLD); the status funnel
// is the only place that needs distinct hues, and those three were run through the
// dataviz skill's validate_palette.js (CVD + chroma + lightness all pass; GOLD's contrast
// WARN against the cream surface is covered by the visible text label on every row).

import { useCallback, useEffect, useState } from "react";

const INK = "#1e2b18";
const RAISED = "#fdfaf5";
const GROUND = "#f2ece0";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";

const STATUS_GOOD = "#2f8a55";
const STATUS_WARNING = GOLD;
const STATUS_CRITICAL = "#b3452b";

const STATUS_COLOUR: Record<string, string> = {
  complete: STATUS_GOOD,
  delivered: STATUS_GOOD,
  submitted: STATUS_WARNING,
  creating: STATUS_WARNING,
  pending: MUTED,
  failed: STATUS_CRITICAL,
};

const TOKEN_KEY = "census2art_admin_token";

type Bucket = { name: string; count: number };

type Stats = {
  totals: {
    allOrders: number;
    realOrders: number;
    conversionRate: number;
    revenueGbp: number;
    failedOrders: number;
  };
  statusCounts: { status: string; count: number }[];
  ordersByDay: { day: string; count: number }[];
  sales: { products: Bucket[]; sizes: Bucket[]; templates: Bucket[] };
  designActivity: {
    totalSessions: number;
    surnames: Bucket[];
    counties: Bucket[];
    districts: Bucket[];
    townlands: Bucket[];
    templates: Bucket[];
  };
};

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const pct = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 });

export default function AdminOrdersPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [state, setState] = useState<"gate" | "loading" | "error" | "ready">("gate");
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async (candidateToken: string) => {
    setState("loading");
    try {
      const res = await fetch("/api/admin/orders/stats", {
        headers: { "x-admin-token": candidateToken },
      });
      if (!res.ok) {
        window.localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setErrorMsg(
          res.status === 404 ? "That token wasn't recognised." : "Could not load the dashboard."
        );
        setState("gate");
        return;
      }
      const body = (await res.json()) as Stats;
      setStats(body);
      setToken(candidateToken);
      window.localStorage.setItem(TOKEN_KEY, candidateToken);
      setState("ready");
    } catch {
      setErrorMsg("Could not reach the server.");
      setState("gate");
    }
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    if (saved) load(saved);
  }, [load]);

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (tokenInput.trim()) load(tokenInput.trim());
  }

  function signOut() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setStats(null);
    setTokenInput("");
    setState("gate");
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
          <h1 className="mt-2 text-2xl font-medium">Orders dashboard</h1>
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

  if (!stats) return null;

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
            <h1 className="mt-2 text-3xl font-medium">Orders dashboard</h1>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => token && load(token)}
              className="rounded-md px-4 py-2 text-sm"
              style={{ border: `1px solid ${RULE}`, color: INK }}
            >
              Refresh
            </button>
            <button
              onClick={signOut}
              className="rounded-md px-4 py-2 text-sm"
              style={{ border: `1px solid ${RULE}`, color: MUTED }}
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <StatTile label="Design sessions" value={String(stats.totals.allOrders)} />
          <StatTile label="Real paid orders" value={String(stats.totals.realOrders)} />
          <StatTile label="Conversion" value={pct.format(stats.totals.conversionRate)} />
          <StatTile label="Revenue (GBP)" value={money.format(stats.totals.revenueGbp)} />
          <StatTile
            label="Failed orders"
            value={String(stats.totals.failedOrders)}
            accent={stats.totals.failedOrders > 0 ? STATUS_CRITICAL : undefined}
          />
        </div>
        <p className="mt-2 text-xs" style={{ color: MUTED }}>
          Revenue is the GBP price recorded at design time, summed across orders with a real
          Shopify order id — treat it as directional, not final financials (multi-currency
          checkout revenue lives in Shopify).
        </p>

        {/* Status funnel */}
        <Section title="Order status">
          <div className="flex flex-wrap gap-3">
            {stats.statusCounts
              .sort((a, b) => b.count - a.count)
              .map((row) => (
                <div
                  key={row.status}
                  className="flex items-center gap-2 rounded-full px-4 py-2"
                  style={{ background: RAISED, border: `1px solid ${RULE}` }}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: STATUS_COLOUR[row.status] ?? MUTED }}
                  />
                  <span className="text-sm capitalize">{row.status}</span>
                  <span className="text-sm font-medium" style={{ color: MUTED }}>
                    {row.count}
                  </span>
                </div>
              ))}
          </div>
        </Section>

        {/* Orders over time */}
        {stats.ordersByDay.length > 0 ? (
          <Section title="Real orders, last 30 days">
            <DayBars data={stats.ordersByDay} />
          </Section>
        ) : null}

        {/* Sales */}
        <Section title="Sales — real paid orders only">
          <div className="grid gap-8 sm:grid-cols-3">
            <RankedBars title="Product" rows={stats.sales.products} />
            <RankedBars title="Size" rows={stats.sales.sizes} />
            <RankedBars title="Template" rows={stats.sales.templates} />
          </div>
        </Section>

        {/* Design activity */}
        <Section
          title="What people are designing"
          subtitle={`All ${stats.designActivity.totalSessions} design sessions, purchased or not — the genealogy interest signal, independent of whether it converted to a sale.`}
        >
          <div className="grid gap-8 sm:grid-cols-2">
            <RankedBars title="Surname" rows={stats.designActivity.surnames} />
            <RankedBars title="County" rows={stats.designActivity.counties} />
            <RankedBars title="District" rows={stats.designActivity.districts} />
            <RankedBars title="Townland" rows={stats.designActivity.townlands} />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-12">
      <h2 className="text-lg font-medium">{title}</h2>
      {subtitle ? (
        <p className="mt-1 max-w-2xl text-sm" style={{ color: MUTED }}>
          {subtitle}
        </p>
      ) : null}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg p-4" style={{ background: RAISED, border: `1px solid ${RULE}` }}>
      <p
        className="text-xs uppercase"
        style={{ letterSpacing: "0.08em", color: MUTED }}
      >
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-medium" style={{ color: accent ?? INK }}>
        {value}
      </p>
    </div>
  );
}

/** Horizontal ranked bars, one sequential hue (GOLD) — every list here is a magnitude
 * ranking (order count), never distinct categories in the same chart, so one hue is
 * correct rather than a categorical set. */
function RankedBars({ title, rows }: { title: string; rows: Bucket[] }) {
  if (rows.length === 0) {
    return (
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-2 text-sm" style={{ color: MUTED }}>
          No data yet.
        </p>
      </div>
    );
  }

  const max = Math.max(...rows.map((r) => r.count));

  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-3 space-y-2.5">
        {rows.map((row) => (
          <li key={row.name}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{row.name}</span>
              <span style={{ color: MUTED }}>{row.count}</span>
            </div>
            <div
              className="mt-1 h-1.5 rounded-full"
              style={{ background: RULE }}
            >
              <div
                className="h-1.5 rounded-full"
                style={{
                  width: `${Math.max(4, (row.count / max) * 100)}%`,
                  background: GOLD,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DayBars({ data }: { data: { day: string; count: number }[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const hovered = data.find((d) => d.day === hover);

  return (
    <div>
      <div className="flex h-24 items-end gap-1">
        {data.map((d) => (
          <div
            key={d.day}
            onMouseEnter={() => setHover(d.day)}
            onMouseLeave={() => setHover((h) => (h === d.day ? null : h))}
            className="flex-1 cursor-default rounded-t"
            style={{
              height: `${Math.max(4, (d.count / max) * 100)}%`,
              background: hover === d.day ? INK : GOLD,
              minWidth: "4px",
              transition: "background 120ms",
            }}
            title={`${d.day}: ${d.count} order${d.count === 1 ? "" : "s"}`}
          />
        ))}
      </div>
      <p className="mt-2 text-sm" style={{ color: MUTED }}>
        {hovered ? `${hovered.day} — ${hovered.count} order${hovered.count === 1 ? "" : "s"}` : "Hover a bar for the date."}
      </p>
    </div>
  );
}
