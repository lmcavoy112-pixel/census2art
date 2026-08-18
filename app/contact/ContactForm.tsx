"use client";

import { useState } from "react";

const RAISED = "#fdfaf5";
const INK = "#1e2b18";
const GOLD = "#b8902a";
const MUTED = "#6b5f4a";
const RULE = "#ddd6c4";

type Topic = "order" | "record" | "other";

const TOPIC_OPTIONS: { id: Topic; label: string }[] = [
  { id: "order", label: "An order" },
  { id: "record", label: "A record or a map" },
  { id: "other", label: "Anything else" },
];

const inputStyle = {
  background: "#ffffff",
  border: `1px solid ${RULE}`,
  color: INK,
};

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<Topic>("order");
  const [message, setMessage] = useState("");
  // Honeypot — left blank by every real visitor, since the field is hidden from view.
  const [company, setCompany] = useState("");
  const [formOpenedAt] = useState(() => Date.now());
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, topic, message, company, formOpenedAt }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || payload?.error) {
        throw new Error(payload?.error || "Could not send your message.");
      }

      setStatus("sent");
      setName("");
      setEmail("");
      setMessage("");
      setTopic("order");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Could not send your message.");
    }
  }

  if (status === "sent") {
    return (
      <div
        className="mt-8 rounded-xl p-6"
        style={{ background: RAISED, border: `1px solid ${RULE}` }}
      >
        <p style={{ color: INK, fontWeight: 400 }}>
          Message sent. We reply from a person, usually within a couple of days.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="mb-1.5 block text-sm" style={{ color: MUTED }}>
            Name
          </label>
          <input
            id="contact-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md px-3 py-2.5 text-sm outline-none focus:border-stone-500"
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="mb-1.5 block text-sm" style={{ color: MUTED }}>
            Email
          </label>
          <input
            id="contact-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md px-3 py-2.5 text-sm outline-none focus:border-stone-500"
            style={inputStyle}
          />
        </div>
      </div>

      <div>
        <label htmlFor="contact-topic" className="mb-1.5 block text-sm" style={{ color: MUTED }}>
          What&apos;s this about?
        </label>
        <select
          id="contact-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value as Topic)}
          className="w-full rounded-md px-3 py-2.5 text-sm outline-none focus:border-stone-500"
          style={inputStyle}
        >
          {TOPIC_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="contact-message" className="mb-1.5 block text-sm" style={{ color: MUTED }}>
          Message
        </label>
        <textarea
          id="contact-message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full resize-y rounded-md px-3 py-2.5 text-sm outline-none focus:border-stone-500"
          style={inputStyle}
        />
      </div>

      {/* Honeypot — off-screen, unreachable by tab, and never announced to a screen
          reader, so no real visitor ever notices or fills it in. */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", top: "-9999px" }}
      >
        <label htmlFor="contact-company">Company</label>
        <input
          id="contact-company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      {status === "error" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{errorMessage}</p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="rounded-full px-7 py-3.5 text-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: INK, color: "#f2ece0" }}
      >
        {status === "sending" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
