import { day, generatePlan, iso, monday, recovery, shift } from "./engine";
import type { PlanTracking, Session, Settings, Snapshot } from "./types";

const rounded = (n: number) => Math.round(n * 10) / 10;
const validDate = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(day(value).getTime()) &&
  iso(day(value)) === value;

/** Validate browser-local decisions separately from wearable measurements. */
export function normalizeTracking(raw: unknown): PlanTracking {
  const value = raw as Partial<PlanTracking> | null;
  return {
    missedDates: Array.isArray(value?.missedDates)
      ? [...new Set(value.missedDates.filter(validDate))].slice(-730)
      : [],
    confirmedThrough: validDate(value?.confirmedThrough)
      ? value.confirmedThrough
      : undefined,
  };
}

/** Conservative app rules, not a validated coaching or readiness model.
 * Rebuild from the original template every time: rerenders never compound cuts.
 * A missing activity is a miss only after a complete import or user confirmation.
 */
export function adaptivePlan(
  settings: Settings,
  snapshot: Snapshot,
  today = iso(new Date()),
  tracking: PlanTracking = { missedDates: [] },
) {
  const base = generatePlan(settings, today);
  const dates = normalizeTracking(tracking);
  const runs = [
    ...new Map(snapshot.runs.map((r) => [r.id, r])).values(),
  ].filter(
    (r) =>
      validDate(r.date) &&
      r.date <= today &&
      Number.isFinite(r.distanceKm) &&
      r.distanceKm > 0,
  );
  const totals = new Map<string, number>();
  for (const run of runs)
    totals.set(run.date, (totals.get(run.date) || 0) + run.distanceKm);
  const synced = new Date(snapshot.syncedAt || "");
  // Bounded/partial activity imports cannot establish that a run did not happen.
  const completeImport =
    Number.isFinite(synced.getTime()) &&
    iso(synced) <= today &&
    !(snapshot.warnings || []).some((s) =>
      /activit.*limit|incomplete|partial/i.test(s),
    );
  const importedThrough = completeImport ? shift(iso(synced), -1) : "";
  const confirmedThrough =
    [importedThrough, dates.confirmedThrough || ""]
      .filter((d) => d && d < today)
      .sort()
      .at(-1) || "";
  const trackingStart = settings.startDate || today;
  const sessions = base.weeks.flatMap((w) => w.sessions);
  const missed = new Set(
    sessions
      .filter(
        (s) =>
          s.km > 0 &&
          s.kind !== "Race" &&
          s.date >= trackingStart &&
          s.date <= today &&
          !totals.has(s.date) &&
          (dates.missedDates.includes(s.date) ||
            (s.date < today &&
              s.date <= confirmedThrough &&
              (!importedThrough ||
                s.date >= shift(iso(synced), -365) ||
                (!!dates.confirmedThrough &&
                  s.date <= dates.confirmedThrough)))),
      )
      .map((s) => s.date),
  );

  const currentStart = monday(today);
  const recentMiss = [...missed].some((date) => date >= shift(today, -2));
  const firstReturn = recentMiss
    ? sessions.find(
        (s) =>
          s.date >= today &&
          s.date <= shift(today, 3) &&
          s.km > 0 &&
          s.kind !== "Race" &&
          !missed.has(s.date) &&
          !totals.has(s.date),
      )?.date
    : undefined;
  const flags = (date: string) => {
    const w = snapshot.wellness.find((x) => x.date === date);
    return recovery(w, date, snapshot.wellness);
  };
  const todaySignals = flags(today);
  // A stale reading never cuts today's plan. Repeated flags reserve two easy days;
  // the next check-in recomputes the decision from the new day's observations.
  const repeatedFlags =
    todaySignals.factor < 1 &&
    [1, 2].some((offset) => flags(shift(today, -offset)).factor < 1);
  const recentInterrupted = base.weeks
    .filter(
      (week) =>
        week.start < currentStart &&
        week.sessions.filter((s) => missed.has(s.date)).length >= 2,
    )
    .at(-1);
  const interruptedActual =
    recentInterrupted?.sessions.reduce(
      (sum, s) => sum + (totals.get(s.date) || 0),
      0,
    ) || 0;
  const restartFactor = recentInterrupted
    ? Math.min(1, Math.max(0.5, interruptedActual / recentInterrupted.km))
    : 1;
  const messages: string[] = [];
  if (todaySignals.factor < 1)
    messages.push(
      repeatedFlags
        ? "Repeated recovery flags: lighter easy sessions today and over the next two days."
        : "Today's recovery flag: shorten the uncompleted session by 20% and keep it easy.",
    );
  const recentMisses = [...missed].filter((d) => d >= shift(today, -14));
  if (recentMisses.length)
    messages.push(
      `${recentMisses.length} missed session(s) in the last 14 days. Missed mileage is dropped, not added to later runs.`,
    );
  if (recentInterrupted)
    messages.push(
      "An interrupted week lowers upcoming training targets. Rebuild gradually within the original plan; the race date and taper stay fixed.",
    );

  const weeks = base.weeks.map((week) => {
    const elapsed = recentInterrupted
      ? Math.max(
          0,
          Math.round(
            (day(week.start).getTime() -
              day(shift(recentInterrupted.start, 7)).getTime()) /
              604800000,
          ),
        )
      : 0;
    const weekFactor =
      week.start >= currentStart
        ? Math.min(1, restartFactor * Math.pow(1.06, elapsed))
        : 1;
    const updated = week.sessions.map((original) => {
      const session: Session & { adjustments: string[] } = {
        ...original,
        plannedKm: original.km,
        plannedKind: original.kind,
        adjustments: [],
      };
      if (totals.has(session.date)) {
        session.status = "completed" as const;
        return session;
      }
      if (missed.has(session.date)) {
        session.status = "missed" as const;
        session.km = 0;
        session.kind = "Rest";
        session.adjustments.push(
          "Missed session. Continue from the adjusted schedule; do not make up the mileage.",
        );
      } else if (session.date < today && original.km > 0) {
        session.status = "unconfirmed" as const;
      } else if (
        session.date >= today &&
        session.km > 0 &&
        session.kind !== "Race"
      ) {
        let factor = weekFactor;
        if (weekFactor < 0.999)
          session.adjustments.push("Reduced build after an interrupted week.");
        if (session.date === firstReturn) {
          factor = Math.min(factor, 0.8);
          session.adjustments.push(
            "First run back after a missed session: shorter and easy.",
          );
        }
        if (session.date === today && todaySignals.factor < 1) {
          factor = Math.min(factor, repeatedFlags ? 0.7 : 0.8);
          session.adjustments.push(
            todaySignals.reasons.join(". ") + ". Keep this session easy.",
          );
        } else if (
          repeatedFlags &&
          session.date > today &&
          session.date <= shift(today, 2)
        ) {
          factor = Math.min(factor, 0.8);
          session.adjustments.push(
            "Easy recovery buffer after repeated recovery flags.",
          );
        }
        if (factor < 0.999) {
          session.km = rounded(original.km * factor);
          if (
            session.date === firstReturn ||
            (session.date <= shift(today, 2) && repeatedFlags) ||
            (session.date === today && todaySignals.factor < 1)
          )
            session.kind = "Easy";
        }
      }
      if (session.adjustments.length)
        session.note =
          session.adjustments.join(" ") + " Original: " + original.note;
      return session;
    });
    return {
      ...week,
      sessions: updated,
      km: rounded(updated.reduce((sum, s) => sum + s.km, 0)),
    };
  });
  return {
    weeks,
    warnings: base.warnings,
    messages,
    missedDates: [...missed],
    confirmedThrough,
  };
}
