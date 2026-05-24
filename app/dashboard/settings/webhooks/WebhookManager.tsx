// app/dashboard/settings/webhooks/WebhookManager.tsx

"use client";

import { useState, useTransition } from "react";
import { createWebhook, deleteWebhook, toggleWebhook } from "./actions";
import type { WebhookTrigger, WebhookProvider } from "@/lib/webhooks";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  provider: WebhookProvider;
  triggers: WebhookTrigger[];
  is_active: boolean;
  created_at: string;
}

interface DeliveryRow {
  id: string;
  webhook_id: string;
  trigger_type: string;
  status: "pending" | "delivered" | "failed";
  response_code: number | null;
  response_body: string | null;
  delivered_at: string | null;
  created_at: string;
}

interface Props {
  webhooks: WebhookRow[];
  deliveries: DeliveryRow[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TRIGGER_OPTIONS: { value: WebhookTrigger; label: string }[] = [
  { value: "explicit", label: "SDK-flagged anomaly" },
  { value: "high_latency", label: "High latency (>10s)" },
  { value: "token_explosion", label: "Token explosion" },
  { value: "cost_spike", label: "Cost spike" },
];

const PROVIDER_OPTIONS: { value: WebhookProvider; label: string }[] = [
  { value: "slack", label: "Slack" },
  { value: "discord", label: "Discord" },
  { value: "generic", label: "Generic (JSON POST)" },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DeliveryRow["status"] }) {
  const styles: Record<DeliveryRow["status"], string> = {
    delivered: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    failed: "bg-red-500/10    text-red-400    border-red-500/20",
    pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  };
  return (
    <span
      className={`text-[11px] px-2 py-0.5 rounded border ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function WebhookCard({
  webhook,
  onDelete,
  onToggle,
}: {
  webhook: WebhookRow;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
}) {
  return (
    <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white text-sm font-medium truncate">
            {webhook.name}
          </p>
          <p className="text-[#52525b] text-[11px] truncate mt-0.5">
            {webhook.url}
          </p>
        </div>
        <span className="shrink-0 text-[11px] px-2 py-0.5 rounded border border-[#1f1f1f] text-[#71717a]">
          {webhook.provider}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {webhook.triggers.map((t) => (
          <span
            key={t}
            className="text-[10px] px-1.5 py-0.5 rounded bg-[#1f1f1f] text-[#a1a1aa]"
          >
            {t.replace(/_/g, " ")}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-[#1f1f1f]">
        <button
          onClick={() => onToggle(webhook.id, !webhook.is_active)}
          className={`text-[11px] font-medium transition-colors ${
            webhook.is_active
              ? "text-emerald-400 hover:text-emerald-300"
              : "text-[#52525b] hover:text-[#71717a]"
          }`}
        >
          {webhook.is_active ? "● Active" : "○ Disabled"}
        </button>
        <button
          onClick={() => onDelete(webhook.id)}
          className="text-[11px] text-[#52525b] hover:text-red-400 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WebhookManager({ webhooks, deliveries }: Props) {
  const [isPending, startTransition] = useTransition();
  const [selectedTriggers, setSelectedTriggers] = useState<WebhookTrigger[]>(
    [],
  );

  function handleDelete(id: string) {
    startTransition(() => {
      deleteWebhook(id);
    });
  }

  function handleToggle(id: string, active: boolean) {
    startTransition(() => {
      toggleWebhook(id, active);
    });
  }

  function handleTriggerToggle(trigger: WebhookTrigger) {
    setSelectedTriggers((prev) =>
      prev.includes(trigger)
        ? prev.filter((t) => t !== trigger)
        : [...prev, trigger],
    );
  }

  async function handleSubmit(formData: FormData) {
    selectedTriggers.forEach((t) => formData.append("triggers", t));
    setSelectedTriggers([]);
    startTransition(() => {
      createWebhook(formData);
    });
  }

  return (
    <div className="space-y-8">
      <section className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-[#1f1f1f] bg-[#0a0a0a]">
          <h2 className="text-white text-[14px] font-medium m-0">
            Add Webhook
          </h2>
          <p className="text-[#71717a] text-[12px] mt-1 m-0">
            Receive real-time alerts when anomalies are detected in your traces.
          </p>
        </div>

        <form action={handleSubmit} className="px-4 md:px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[#a1a1aa] text-[11px] uppercase tracking-[0.05em] mb-1.5">
                Name
              </label>
              <input
                name="name"
                required
                placeholder="e.g. Prod Alerts"
                className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded px-3 py-2 text-white text-sm placeholder-[#3f3f46] focus:outline-none focus:border-[#3f3f46]"
              />
            </div>
            <div>
              <label
                htmlFor="provider"
                className="block text-[#a1a1aa] text-[11px] uppercase tracking-[0.05em] mb-1.5"
              >
                Provider
              </label>
              <select
                id="provider"
                name="provider"
                required
                title="Provider"
                aria-label="Provider"
                className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-[#3f3f46]"
              >
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[#a1a1aa] text-[11px] uppercase tracking-[0.05em] mb-1.5">
              Webhook URL
            </label>
            <input
              name="url"
              type="url"
              required
              placeholder="https://hooks.slack.com/services/..."
              className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded px-3 py-2 text-white text-sm placeholder-[#3f3f46] focus:outline-none focus:border-[#3f3f46]"
            />
          </div>

          <div>
            <label className="block text-[#a1a1aa] text-[11px] uppercase tracking-[0.05em] mb-2">
              Triggers
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TRIGGER_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={selectedTriggers.includes(opt.value)}
                    onChange={() => handleTriggerToggle(opt.value)}
                    className="accent-white"
                  />
                  <span className="text-[#a1a1aa] text-sm group-hover:text-white transition-colors">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending || selectedTriggers.length === 0}
            className="w-full sm:w-auto px-5 py-2 bg-white text-black text-sm font-medium rounded hover:bg-[#e5e5e5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? "Saving…" : "Add Webhook"}
          </button>
        </form>
      </section>

      {webhooks.length > 0 && (
        <section className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden">
          <div className="px-4 md:px-6 py-4 border-b border-[#1f1f1f] bg-[#0a0a0a]">
            <h2 className="text-white text-[14px] font-medium m-0">
              Configured Webhooks
              <span className="ml-2 text-[#52525b] font-normal">
                ({webhooks.length})
              </span>
            </h2>
          </div>
          <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
            {webhooks.map((w) => (
              <WebhookCard
                key={w.id}
                webhook={w}
                onDelete={handleDelete}
                onToggle={handleToggle}
              />
            ))}
          </div>
        </section>
      )}

      {deliveries.length > 0 && (
        <section className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden">
          <div className="px-4 md:px-6 py-4 border-b border-[#1f1f1f] bg-[#0a0a0a]">
            <h2 className="text-white text-[14px] font-medium m-0">
              Delivery Log
            </h2>
            <p className="text-[#71717a] text-[12px] mt-1 m-0">
              Last 50 webhook delivery attempts.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1f1f1f]">
                  {[
                    "Trigger",
                    "Status",
                    "HTTP",
                    "Response",
                    "Delivered At",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 md:px-6 py-3 text-left text-[11px] text-[#52525b] uppercase tracking-[0.05em] font-medium whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-[#1f1f1f] last:border-0 hover:bg-[#0a0a0a]"
                  >
                    <td className="px-4 md:px-6 py-3 text-[#a1a1aa] whitespace-nowrap">
                      {d.trigger_type.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 md:px-6 py-3 whitespace-nowrap">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-4 md:px-6 py-3 text-[#71717a] whitespace-nowrap">
                      {d.response_code ?? "—"}
                    </td>
                    <td className="px-4 md:px-6 py-3 text-[#52525b] max-w-[200px] truncate">
                      {d.response_body ?? "—"}
                    </td>
                    <td className="px-4 md:px-6 py-3 text-[#52525b] whitespace-nowrap">
                      {d.delivered_at
                        ? new Date(d.delivered_at).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
