import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Aggregates the `orders` table for the internal dashboard (app/admin/orders/page.tsx).
 * Token-gated the same way as the other internal order routes — this reads surnames,
 * order value and (indirectly, via status) fulfilment failures, none of which should be
 * public.
 *
 * Aggregation happens in JS rather than SQL because the table is currently tiny (dozens
 * of rows, see the 2026-08 dashboard build). If this ever grows into the thousands, move
 * these group-bys into SQL (or a view) instead of pulling every row per request.
 */

type OrderRow = {
  id: string;
  status: string;
  created_at: string;
  shopify_order_id: number | null;
  price_gbp: string | number | null;
  product: string | null;
  template: string | null;
  size_label: string | null;
  surname: string | null;
  county: string | null;
  district: string | null;
  townland: string | null;
};

function countBy(rows: OrderRow[], field: keyof OrderRow, limit = 10) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = row[field];
    const value = typeof raw === "string" ? raw.trim() : raw;
    if (!value) continue;
    counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

export async function GET(request: NextRequest) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, status, created_at, shopify_order_id, price_gbp, product, template, size_label, surname, county, district, townland"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("admin/orders/stats: query failed:", error.message);
    return NextResponse.json({ error: "Could not load order stats." }, { status: 500 });
  }

  const rows = (data ?? []) as OrderRow[];
  const realOrders = rows.filter((row) => row.shopify_order_id != null);

  const statusCounts = new Map<string, number>();
  for (const row of rows) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  }

  const revenueGbp = realOrders.reduce((sum, row) => sum + (Number(row.price_gbp) || 0), 0);

  // Last 30 days of real orders, one count per calendar day (UTC), oldest first.
  const dayBuckets = new Map<string, number>();
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const row of realOrders) {
    const ts = new Date(row.created_at).getTime();
    if (ts < since) continue;
    const day = row.created_at.slice(0, 10);
    dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + 1);
  }
  const ordersByDay = [...dayBuckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, count]) => ({ day, count }));

  return NextResponse.json({
    totals: {
      allOrders: rows.length,
      realOrders: realOrders.length,
      conversionRate: rows.length ? realOrders.length / rows.length : 0,
      revenueGbp,
      failedOrders: statusCounts.get("failed") ?? 0,
    },
    statusCounts: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
    ordersByDay,
    sales: {
      products: countBy(realOrders, "product"),
      sizes: countBy(realOrders, "size_label"),
      templates: countBy(realOrders, "template"),
    },
    // Every design session, purchased or not -- the surname/county/district/townland
    // someone typed in is a genealogy-interest signal whether or not they checked out,
    // which is why this is deliberately NOT scoped to realOrders.
    designActivity: {
      totalSessions: rows.length,
      surnames: countBy(rows, "surname"),
      counties: countBy(rows, "county"),
      districts: countBy(rows, "district"),
      townlands: countBy(rows, "townland"),
      templates: countBy(rows, "template"),
    },
  });
}
