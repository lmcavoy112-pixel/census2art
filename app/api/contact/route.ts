import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { contactRequestSchema, type ContactRequest } from "@/lib/validation";

/**
 * Public contact form submissions.
 *
 * Two lightweight defenses sit on top of the proxy's per-IP rate limit
 * (lib/rate-limit.ts): a honeypot field real visitors never see or fill, and a minimum
 * time between the form rendering and the submit arriving. Neither stops a determined
 * attacker, but together they catch the great majority of scripted form spam without
 * asking a real visitor to prove anything.
 */

const MIN_FILL_TIME_MS = 1500;

export async function POST(request: NextRequest) {
  let body: ContactRequest;

  try {
    body = contactRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const filledTooFast =
    typeof body.formOpenedAt === "number" && Date.now() - body.formOpenedAt < MIN_FILL_TIME_MS;

  // Honeypot tripped, or answered faster than a person could read the form and type into
  // it: report success so a bot has no signal to route around, but never write the row.
  if (body.company || filledTooFast) {
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabaseAdmin.from("contact_submissions").insert({
    name: body.name,
    email: body.email,
    topic: body.topic,
    message: body.message,
  });

  if (error) {
    console.error("Contact submission insert error:", error);
    return NextResponse.json({ error: "Could not send your message." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
