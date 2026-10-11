import { iso, shift } from "./engine";
import type { Run, Settings, Snapshot } from "./types";
export const today = iso(new Date());
export const defaultSettings: Settings = {
  startDate: today,
  raceName: "San Francisco Marathon",
  raceDate: today < "2027-07-25" ? "2027-07-25" : shift(today, 196),
  goalMinutes: 240,
  days: 4,
  weeklyKm: 25,
  peakWeeklyKm: 56.32704,
  longestKm: 10,
  recentRaceKm: 0,
  recentRaceMinutes: 0,
};
export const demoSettings: Settings = {
  ...defaultSettings,
  raceName: "San Francisco · sample goal",
  goalMinutes: 225,
  days: 5,
  weeklyKm: 42,
  longestKm: 17,
  recentRaceKm: 21.0975,
  recentRaceMinutes: 106,
};
export function demoSnapshot(): Snapshot {
  const runs: Run[] = [];
  for (let i = 1; i < 57; i++) {
    if ([0, 3].includes(new Date(`${shift(today, -i)}T12:00`).getDay()))
      continue;
    const km = Number(
      (i % 7 === 0 ? 15 + (i % 3) : 5.8 + (i % 5) * 0.85).toFixed(2),
    );
    runs.push({
      id: `sample-${i}`,
      date: shift(today, -i),
      name:
        i % 7 === 0
          ? "Sunday long run"
          : i % 3 === 0
            ? "A little hill work"
            : "Morning miles",
      distanceKm: km,
      durationSec: Math.round(km * (340 + (i % 8) * 4)),
      avgHr: 136 + (i % 17),
      elevationM: 35 + (i % 11) * 5,
      cadenceSpm: 163 + (i % 9),
      maxHr: 160 + (i % 12),
      avgPowerW: 235 + (i % 20),
      aerobicEffect: 2.7 + (i % 4) * 0.2,
      anaerobicEffect: 0.4,
      vo2Max: 49.8,
      groundContactMs: 245 + (i % 9),
    });
  }
  return {
    runs,
    performance: {
      vo2Max: 49.8,
      vo2Date: shift(today, -2),
      trainingReadiness: 78,
      readinessDate: today,
      racePredictions: {
        date: today,
        fiveKSec: 1370,
        tenKSec: 2850,
        halfSec: 6350,
        marathonSec: 13500,
      },
    },
    wellness: Array.from({ length: 28 }, (_, i) => ({
      date: shift(today, -i),
      restingHr: 49 + (i % 3),
      sleepScore: 82 + (i % 5) - 4,
      sleepHours: 7.4 + (i % 4) * 0.15,
      hrvMs: 54 + (i % 7) - 3,
      hrv7DayMs: 54,
      hrvBaselineLow: 45,
      hrvBaselineHigh: 65,
    })),
  };
}
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
export function saveStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function normalizeImport(raw: unknown): Snapshot {
  if (!raw || typeof raw !== "object")
    throw new Error("Choose a Milemark JSON export.");
  const data = raw as Snapshot;
  if (
    !Array.isArray(data.runs) ||
    data.runs.length > 10000 ||
    !Array.isArray(data.wellness) ||
    data.wellness.length > 2000
  )
    throw new Error("Invalid export: runs and wellness arrays are required.");
  const validDate = (s: unknown) =>
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(new Date(s + "T12:00:00").getTime()) &&
    iso(new Date(s + "T12:00:00")) === s;
  const num = (n: unknown, min: number, max: number) =>
    typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
  const runs = data.runs.map((r, i) => {
    if (
      !r ||
      !validDate(r.date) ||
      !num(r.distanceKm, 0.01, 300) ||
      !num(r.durationSec, 1, 604800) ||
      typeof r.name !== "string"
    )
      throw new Error(
        `Run ${i + 1} has invalid date, distance, duration, or name.`,
      );
    return {
      id: String(r.id || `import-${i}`),
      date: r.date,
      name: r.name.slice(0, 160),
      distanceKm: r.distanceKm,
      durationSec: r.durationSec,
      avgHr: num(r.avgHr, 20, 250) ? r.avgHr : null,
      elevationM: num(r.elevationM, 0, 100000) ? r.elevationM : null,
      cadenceSpm: num(r.cadenceSpm, 40, 300) ? r.cadenceSpm : null,
      maxHr: num(r.maxHr, 20, 250) ? r.maxHr : null,
      avgPowerW: num(r.avgPowerW, 1, 2000) ? r.avgPowerW : null,
      aerobicEffect: num(r.aerobicEffect, 0, 5) ? r.aerobicEffect : null,
      anaerobicEffect: num(r.anaerobicEffect, 0, 5) ? r.anaerobicEffect : null,
      vo2Max: num(r.vo2Max, 10, 100) ? r.vo2Max : null,
      groundContactMs: num(r.groundContactMs, 50, 1000)
        ? r.groundContactMs
        : null,
      race: r.race === true,
    };
  });
  const wellness = data.wellness.map((w, i) => {
    if (!w || !validDate(w.date))
      throw new Error(`Recovery record ${i + 1} has an invalid date.`);
    for (const [key, max] of [
      ["sleepHours", 24],
      ["sleepScore", 100],
      ["hrvMs", 500],
      ["hrv7DayMs", 500],
      ["hrvBaselineLow", 500],
      ["hrvBaselineHigh", 500],
      ["restingHr", 250],
    ] as const)
      if (w[key] != null && !num(w[key], 0, max))
        throw new Error(`Recovery record ${i + 1}: invalid ${key}.`);
    return {
      date: w.date,
      sleepHours: w.sleepHours ?? null,
      sleepScore: w.sleepScore ?? null,
      hrvMs: w.hrvMs ?? null,
      hrv7DayMs: w.hrv7DayMs ?? null,
      hrvBaselineLow: w.hrvBaselineLow ?? null,
      hrvBaselineHigh: w.hrvBaselineHigh ?? null,
      restingHr: w.restingHr ?? null,
    };
  });
  return {
    runs: [...new Map(runs.map((r) => [r.id, r])).values()],
    wellness,
    syncedAt: typeof data.syncedAt === "string" ? data.syncedAt : undefined,
    performance: data.performance
      ? {
          vo2Max: num(data.performance.vo2Max, 10, 100)
            ? data.performance.vo2Max
            : null,
          vo2Date: validDate(data.performance.vo2Date)
            ? data.performance.vo2Date
            : null,
          trainingReadiness: num(data.performance.trainingReadiness, 0, 100)
            ? data.performance.trainingReadiness
            : null,
          readinessDate: validDate(data.performance.readinessDate)
            ? data.performance.readinessDate
            : null,
          racePredictions: {
            date: validDate(data.performance.racePredictions?.date)
              ? data.performance.racePredictions?.date
              : null,
            fiveKSec: num(
              data.performance.racePredictions?.fiveKSec,
              100,
              100000,
            )
              ? data.performance.racePredictions?.fiveKSec
              : null,
            tenKSec: num(data.performance.racePredictions?.tenKSec, 100, 100000)
              ? data.performance.racePredictions?.tenKSec
              : null,
            halfSec: num(data.performance.racePredictions?.halfSec, 100, 100000)
              ? data.performance.racePredictions?.halfSec
              : null,
            marathonSec: num(
              data.performance.racePredictions?.marathonSec,
              100,
              100000,
            )
              ? data.performance.racePredictions?.marathonSec
              : null,
          },
        }
      : undefined,
    warnings: Array.isArray(data.warnings)
      ? data.warnings
          .filter((x) => typeof x === "string")
          .map((x) => x.slice(0, 200))
          .slice(0, 50)
      : [],
  };
}
export function download(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function mergeSnapshots(
  previous: Snapshot,
  imported: Snapshot,
): Snapshot {
  const records = new Map(previous.wellness.map((w) => [w.date, w]));
  for (const current of imported.wellness) {
    const old = records.get(current.date);
    records.set(current.date, {
      ...old,
      ...Object.fromEntries(
        Object.entries(current).filter(([, value]) => value != null),
      ),
    } as typeof current);
  }
  return {
    ...imported,
    runs: [
      ...new Map(
        [...previous.runs, ...imported.runs].map((r) => [r.id, r]),
      ).values(),
    ],
    wellness: [...records.values()].sort((a, b) =>
      b.date.localeCompare(a.date),
    ),
  };
}
