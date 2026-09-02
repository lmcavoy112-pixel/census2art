"use client";

import { useEffect, useState } from "react";

import FramedPrint from "./FramedPrint";
import type { CensusCollection } from "@/lib/censusEditions";

const MAX_RECENT_PURCHASES = 3;

type RecentOrderRow = {
  id: string;
  surname: string | null;
  county: string | null;
  previewUrl: string | null;
};

type DisplayPurchase = { img: string; surname: string; county?: string };

/**
 * Real, paid orders (GET /api/recent-orders — see that route for why it's safe to show
 * publicly). Fetched once; the caller mixes these into an edition whose records are
 * actually `available`, since the route isn't scoped per census edition and there's
 * nothing to attribute them to otherwise.
 */
function useLiveRecentPurchases(): DisplayPurchase[] {
  const [live, setLive] = useState<DisplayPurchase[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/recent-orders")
      .then((res) => (res.ok ? res.json() : { orders: [] }))
      .then((body: { orders?: RecentOrderRow[] }) => {
        if (cancelled) return;
        const rows = (body.orders ?? []).filter(
          (row): row is RecentOrderRow & { previewUrl: string } => Boolean(row.previewUrl)
        );
        setLive(
          rows.map((row) => ({
            img: row.previewUrl,
            surname: row.surname || "Untitled",
            county: row.county ?? undefined,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setLive([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return live;
}

const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";

/**
 * Real customer orders, shown as social proof. Always keyed off the collection's first
 * `available` edition rather than any interactive year toggle — today only 1901 has any
 * static placeholders to pad out with, and live orders aren't attributed to a year at all.
 */
export default function RecentPurchases({ collection }: { collection: CensusCollection }) {
  const edition =
    collection.editions.find((e) => e.available) ?? collection.editions[0];

  const liveRecentPurchases = useLiveRecentPurchases();
  const recentPurchases = (
    edition.available ? [...liveRecentPurchases, ...edition.recentPurchases] : edition.recentPurchases
  ).slice(0, MAX_RECENT_PURCHASES);

  if (recentPurchases.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-10 sm:py-12">
      <p
        style={{
          fontFamily: "var(--font-plex-mono)",
          fontSize: "0.66rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: GOLD,
        }}
      >
        Recent purchases
      </p>

      <ul className="mt-6 grid max-w-3xl grid-cols-3 gap-5 sm:gap-7">
        {recentPurchases.map((purchase) => (
          <li key={purchase.img}>
            <FramedPrint
              src={purchase.img}
              alt={`${purchase.surname} family print from the ${edition.year} census`}
              matPadding="8px"
              frameWidth="6px"
            />
            <p
              className="mt-3 text-center"
              style={{
                fontFamily: "var(--font-cormorant)",
                fontSize: "1.05rem",
                color: INK,
              }}
            >
              {purchase.surname}
              {purchase.county ? (
                <span
                  className="block"
                  style={{
                    fontFamily: "var(--font-plex-mono)",
                    fontSize: "0.62rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: MUTED,
                    marginTop: "0.2rem",
                  }}
                >
                  {purchase.county}
                </span>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
