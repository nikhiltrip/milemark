import { useId, useState } from "react";
import { day } from "./engine";
export function SignalChart({
  values,
  unit,
  label,
  ceiling,
  period = "day",
}: {
  values: { date: string; value?: number | null; detail?: string }[];
  unit: string;
  label: string;
  ceiling?: number;
  period?: "day" | "week";
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const id = useId();
  const active =
    values.find((v) => v.date === (hovered || selected)) ||
    [...values].reverse().find((v) => v.value != null) ||
    values.at(-1);
  const max = ceiling ?? Math.max(1, ...values.map((v) => v.value ?? 0)) * 1.15;
  const date = (s: string) =>
    (period === "week" ? "Week of " : "") +
    day(s).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  const reading = (v: typeof active) =>
    v?.value != null
      ? `${Number(v.value.toFixed(unit === "mi" || unit === "km" ? 2 : 1)).toLocaleString()} ${unit}${v.detail ? ` · ${v.detail}` : ""}`
      : "No reading";
  return (
    <div className="signal-chart-shell">
      <div className="chart-readout" aria-live="polite" aria-atomic="true">
        <span>{active ? date(active.date) : "No history yet"}</span>
        <strong>{reading(active)}</strong>
      </div>
      <div
        className="signal-bars"
        role="group"
        aria-label={label}
        onMouseLeave={() => setHovered(null)}
      >
        {values.map((v) => (
          <button
            type="button"
            key={v.date}
            aria-label={`${date(v.date)}: ${reading(v)}`}
            aria-pressed={selected === v.date}
            aria-describedby={hovered === v.date ? `${id}-tooltip` : undefined}
            className={`${active?.date === v.date ? "highlighted" : ""} ${v.value == null ? "missing" : ""}`}
            onMouseEnter={() => setHovered(v.date)}
            onFocus={() => setHovered(v.date)}
            onBlur={() => setHovered(null)}
            onClick={() => {
              setSelected(v.date);
              setHovered(v.date);
            }}
          >
            <span className="bar-space">
              <span
                className="bar-fill"
                style={{
                  height: `${v.value != null ? Math.max(2, (v.value / max) * 100) : 2}%`,
                }}
              />
            </span>
            <small>
              {period === "week"
                ? day(v.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : day(v.date).getDate()}
            </small>
            {hovered === v.date && (
              <span
                id={`${id}-tooltip`}
                role="tooltip"
                className="chart-hover-tooltip"
              >
                <b>{date(v.date)}</b>
                <span>{reading(v)}</span>
              </span>
            )}
          </button>
        ))}
      </div>
      <p className="chart-hint">
        Hover, tap, or focus a {period} to inspect its reading. Gaps mean no
        data.
      </p>
    </div>
  );
}
