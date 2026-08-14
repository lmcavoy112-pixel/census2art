"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import SiteHeader from "../../components/home/SiteHeader";

type OrderStatus = {
  id: string;
  status: string;
  sku: string;
  copies: number;
  image_url: string;
  price_gbp: number | null;
  prodigi_order_id: string | null;
  error: string | null;
  design: { surname?: string; product?: string; sizeLabel?: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Preparing your order",
  creating: "Submitting to Prodigi",
  submitted: "Submitted to Prodigi",
  in_production: "In production",
  shipped: "Shipped",
  complete: "Complete",
  cancelled: "Cancelled",
  failed: "Failed",
};

export default function OrderStatusPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/orders/${params.id}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error || "Order not found.");
        if (!cancelled) setOrder(result.order);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Order not found.");
      }
    }

    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [params.id]);

  let content: ReactNode;

  if (error) {
    content = (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-red-700">{error}</p>
      </main>
    );
  } else if (!order) {
    content = (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-neutral-500">Loading…</p>
      </main>
    );
  } else {
    content = (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-neutral-900">Order status</h1>
        <p className="mt-1 text-sm text-neutral-500">Order {order.id}</p>

        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-lg font-medium text-neutral-900">
            {STATUS_LABEL[order.status] ?? order.status}
          </p>
          {order.design?.product && (
            <p className="mt-1 text-sm text-neutral-600">
              {order.design.product} — {order.design.sizeLabel}
            </p>
          )}
          {order.prodigi_order_id && (
            <p className="mt-1 text-xs text-neutral-400">Prodigi order: {order.prodigi_order_id}</p>
          )}
          {order.error && <p className="mt-3 text-sm text-red-700">{order.error}</p>}
        </div>
      </main>
    );
  }

  return (
    <>
      <SiteHeader />
      {content}
    </>
  );
}
