// components/dashboard/MetricCard.tsx
//
// Pure presentational component — no interactivity, no client bundle cost.
// Deliberately NOT "use client" so it can be used inside Server Components.

// ── Types ─────────────────────────────────────────────────────────────────────

type ValueColor = "white" | "emerald" | "amber" | "rose" | "blue";

export interface MetricCardProps {
  label:       string;
  value:       string;
  valueColor?: ValueColor;
  /** Optional small trend indicator below the value, e.g. "+12% vs yesterday" */
  trend?:      string;
  trendUp?:    boolean;
}

// ── Color map ─────────────────────────────────────────────────────────────────

const VALUE_COLOR: Record<ValueColor, string> = {
  white:   "text-white",
  emerald: "text-[#10b981]",
  amber:   "text-[#f59e0b]",
  rose:    "text-[#f43f5e]",
  blue:    "text-[#3b82f6]",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function MetricCard({
  label,
  value,
  valueColor = "white",
  trend,
  trendUp,
}: MetricCardProps) {
  return (
    <div className="bg-[#111] border border-[#1f1f1f] rounded-lg p-5">
      <div className="text-[#71717a] text-[12px] uppercase tracking-[0.05em]">
        {label}
      </div>

      <div
        className={[
          "mt-2.5 text-[36px] leading-none font-semibold tracking-[-0.03em]",
          VALUE_COLOR[valueColor],
        ].join(" ")}
      >
        {value}
      </div>

      {trend && (
        <div
          className={[
            "mt-2 text-xs",
            trendUp ? "text-[#10b981]" : "text-[#f43f5e]",
          ].join(" ")}
        >
          {trend}
        </div>
      )}
    </div>
  );
}