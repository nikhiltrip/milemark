import type { Settings, Snapshot, Week, Wellness } from "./types";
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const day = (s: string) => new Date(`${s}T12:00:00`);
export function shift(s: string, n: number) {
  const d = day(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
export function monday(s: string) {
  const d = day(s);
  return shift(s, -((d.getDay() + 6) % 7));
}
const round = (n: number) => Math.round(n * 10) / 10;
export function validate(s: Settings, today = iso(new Date())): string[] {
  const e: string[] = [];
  if (!s || typeof s !== "object") return ["Invalid goal settings."];
  if (typeof s.raceName !== "string" || !s.raceName.trim())
    e.push("Enter a race name.");
  if (
    s.startDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(s.startDate) ||
      !Number.isFinite(day(s.startDate).getTime()) ||
      iso(day(s.startDate)) !== s.startDate ||
      s.startDate > today)
  )
    e.push("Invalid plan start date.");
  const race = day(s.raceDate);
  if (
    !Number.isFinite(race.getTime()) ||
    iso(race) !== s.raceDate ||
    s.raceDate <= today
  )
    e.push("Choose a race date in the future.");
  if (
    !Number.isFinite(s.goalMinutes) ||
    s.goalMinutes < 120 ||
    s.goalMinutes > 600
  )
    e.push("Goal time must be between 2 and 10 hours.");
  if (![3, 4, 5, 6].includes(s.days)) e.push("Choose 3–6 running days.");
  if (!Number.isFinite(s.weeklyKm) || s.weeklyKm < 10 || s.weeklyKm > 160)
    e.push("Enter a recent weekly volume between 10 and 160 km.");
  if (
    !Number.isFinite(s.longestKm) ||
    s.longestKm < 1 ||
    s.longestKm > s.weeklyKm
  )
    e.push("Longest recent run must be between 1 km and your weekly volume.");
  if (
    !Number.isFinite(s.recentRaceKm) ||
    !Number.isFinite(s.recentRaceMinutes) ||
    s.recentRaceKm < 0 ||
    s.recentRaceMinutes < 0
  )
    e.push("Race history cannot contain negative or invalid numbers.");
  if ((s.recentRaceKm === 0) !== (s.recentRaceMinutes === 0))
    e.push("Enter both recent race distance and time, or leave both at zero.");
  if (
    s.recentRaceKm > 0 &&
    (s.recentRaceKm < 1 ||
      s.recentRaceKm > 50 ||
      s.recentRaceMinutes < 3 ||
      s.recentRaceMinutes > 900)
  )
    e.push("Check your recent race distance and time.");
  return e;
}
export function recovery(
  w: Wellness | undefined,
  today = iso(new Date()),
  series: Wellness[] = [],
) {
  if (!w || w.date < shift(today, -2) || w.date > today)
    return {
      label: "No recent signals",
      tone: "neutral",
      factor: 1,
      reasons: [
        "Add a recent check-in or sync your watch. Missing data is not a readiness score.",
      ],
    };
  const reasons: string[] = [];
  if (w.sleepHours != null && w.sleepHours < 6)
    reasons.push("Less than 6 hours of sleep");
  if (w.sleepScore != null && w.sleepScore < 60)
    reasons.push("Sleep score below 60");
  const recent = Array.from(
    { length: 7 },
    (_, i) => series.find((x) => x.date === shift(w.date, -i))?.hrvMs,
  );
  const rolling =
    w.hrv7DayMs ??
    (recent.every((x) => x != null)
      ? recent.reduce<number>((sum, x) => sum + (x ?? 0), 0) / 7
      : null);
  if (rolling != null && w.hrvBaselineLow != null && rolling < w.hrvBaselineLow)
    reasons.push("7-day HRV below your personal baseline");
  if (
    rolling != null &&
    w.hrvBaselineHigh != null &&
    rolling > w.hrvBaselineHigh
  )
    reasons.push("7-day HRV above your personal baseline; check how you feel");
  const known =
    w.sleepHours != null ||
    w.sleepScore != null ||
    (rolling != null && w.hrvBaselineLow != null);
  return {
    label: reasons.length
      ? "Take it easier"
      : known
        ? "Keep it comfortable"
        : "No recent signals",
    tone: reasons.length ? "caution" : "neutral",
    factor: reasons.length ? 0.8 : 1,
    reasons: reasons.length
      ? reasons
      : [
          "No recovery flags in the available signals. How you feel still comes first.",
        ],
  };
}
export function prediction(s: Settings, snapshot: Snapshot) {
  // Use explicitly marked races only. Easy training runs are not race performances.
  const races = snapshot.runs
    .filter((r) => r.race && r.distanceKm >= 5 && r.durationSec > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  const race = races[0];
  const distance = race?.distanceKm || s.recentRaceKm;
  const minutes = race ? race.durationSec / 60 : s.recentRaceMinutes;
  return distance > 0 && minutes > 0
    ? {
        minutes: minutes * Math.pow(42.195 / distance, 1.06),
        source: race ? race.name : "Your recent race",
        caveat:
          "Riegel estimate; not adjusted for endurance, course, weather, or injury.",
      }
    : null;
}
export function history(snapshot: Snapshot, today = iso(new Date())) {
  return Array.from({ length: 8 }, (_, i) => {
    const start = shift(monday(today), (i - 7) * 7),
      end = shift(start, 7);
    const runs = snapshot.runs.filter((r) => r.date >= start && r.date < end);
    return {
      start,
      km: round(runs.reduce((s, r) => s + r.distanceKm, 0)),
      runs: runs.length,
    };
  });
}
export function trainingBase(snapshot: Snapshot, today = iso(new Date())) {
  const completed = history(snapshot, today).slice(3, 7);
  const average = round(completed.reduce((sum, w) => sum + w.km, 0) / 4);
  const runs = snapshot.runs.filter(
    (r) => r.date >= shift(today, -28) && r.date <= today,
  );
  const longest = round(Math.max(0, ...runs.map((r) => r.distanceKm)));
  return {
    weeklyKm: Math.max(10, Math.min(160, average)),
    longestKm: Math.max(1, Math.min(longest, Math.max(10, average))),
  };
}
export function generatePlan(
  s: Settings,
  today = iso(new Date()),
): { weeks: Week[]; warnings: string[] } {
  const errors = validate(s, today);
  if (errors.length) throw new Error(errors.join(" "));
  const first = monday(s.startDate || today),
    raceWeek = monday(s.raceDate);
  const count =
    Math.round(
      (day(raceWeek).getTime() - day(first).getTime()) / 86400000 / 7,
    ) + 1;
  if (count > 104) throw new Error("Choose a race within the next two years.");
  const warnings: string[] = [];
  if (count < 12)
    warnings.push(
      "Less than 12 weeks remain. This schedule preserves your base rather than trying to rush marathon fitness.",
    );
  if (s.weeklyKm < 25)
    warnings.push(
      "Your current base is below 25 km/week. Prioritize a comfortable base and consider revisiting your race timeline.",
    );
  if (s.days === 3)
    warnings.push(
      "Three days limits marathon preparation. Keep the goal flexible and consider coach guidance.",
    );
  const active: Record<number, number[]> = {
    3: [1, 3, 6],
    4: [1, 3, 5, 6],
    5: [1, 2, 3, 5, 6],
    6: [0, 1, 2, 3, 5, 6],
  };
  let volume = s.weeklyKm,
    long = s.longestKm;
  const weeks: Week[] = [];
  // Extra time before a 20-week build is a steady base phase, never a 40-week mileage ramp.
  const buildStart = Math.max(0, count - 20),
    peakCap = Math.max(s.weeklyKm, Math.min(80, s.weeklyKm * 1.65));
  for (let i = 0; i < count; i++) {
    const left = count - i - 1,
      build = i - buildStart,
      cutback = build >= 0 && build % 4 === 3;
    let phase =
      build < 0
        ? "Base"
        : left < 3
          ? "Taper"
          : cutback
            ? "Recovery week"
            : "Build";
    if (build >= 0 && left >= 3 && build > 0) {
      if (!cutback) volume = Math.min(peakCap, volume * 1.045);
    }
    // Taper always takes precedence over a recovery-week index. The race itself
    // is excluded from the taper training budget. These fractions are app
    // parameters, not a reproduction of a trial protocol (see evidence.ts).
    const taperFactor =
      left === 0
        ? 0.4
        : left === 1
          ? 0.6
          : left === 2
            ? 0.8
            : cutback
              ? 0.8
              : 1;
    const total = round(volume * taperFactor);
    if (build >= 0 && left >= 3 && !cutback) long = Math.min(30, long + 1);
    const longKm = round(
      Math.min(
        long * (cutback ? 0.8 : left === 2 ? 0.75 : left === 1 ? 0.5 : 1),
        total * 0.4,
        30,
      ),
    );
    const start = shift(first, i * 7),
      runningDays = active[s.days];
    const other = round((total - longKm) / (s.days - 1));
    const sessions = Array.from({ length: 7 }, (_, j) => {
      const date = shift(start, j);
      if (date > s.raceDate)
        return {
          date,
          kind: "Rest" as const,
          km: 0,
          note: "Recover after race day.",
        };
      if (date === s.raceDate)
        return {
          date,
          kind: "Race" as const,
          km: 42.195,
          note: "Start controlled. Adjust to conditions and how you feel.",
        };
      if (!runningDays.includes(j))
        return {
          date,
          kind: "Rest" as const,
          km: 0,
          note: "Rest, gentle mobility, or optional easy cross-training.",
        };
      const daysToRace = Math.round(
        (day(s.raceDate).getTime() - day(date).getTime()) / 86400000,
      );
      if (daysToRace === 1)
        return {
          date,
          kind: "Rest" as const,
          km: 0,
          note: "Rest before your race. Keep the day low-key.",
        };
      const isLong = j === 6 && daysToRace >= 14,
        steady = j === 3 && build >= 4 && left >= 3 && s.days >= 4 && !cutback;
      return {
        date,
        kind: isLong
          ? ("Long run" as const)
          : steady
            ? ("Steady" as const)
            : ("Easy" as const),
        km: daysToRace < 7 ? round(total / s.days) : isLong ? longKm : other,
        note: isLong
          ? "Conversational effort. Practice your race-day routine."
          : steady
            ? "Mostly easy; add a short controlled steady section only if recovered."
            : "Comfortable, conversational effort. No pace to chase.",
      };
    });
    if (left === 0) phase = "Race week";
    weeks.push({
      start,
      phase,
      km: round(sessions.reduce((sum, x) => sum + x.km, 0)),
      sessions,
    });
  }
  const maxLong = Math.max(
    0,
    ...weeks.flatMap((w) =>
      w.sessions.filter((x) => x.kind === "Long run").map((x) => x.km),
    ),
  );
  if (maxLong < 25)
    warnings.push(
      `The longest scheduled run is ${maxLong.toFixed(1)} km. This limited base may leave you underprepared for a marathon; consider more base-building time and individualized coaching.`,
    );
  return { weeks, warnings };
}
/** Descriptive outcomes, not a causal estimate of this plan's effectiveness. */
export function progress(snapshot: Snapshot, today = iso(new Date())) {
  const completed = history(snapshot, today).slice(0, 7);
  const recent = completed.slice(-4),
    earlier = completed.slice(0, 3);
  const avg = (xs: { km: number }[]) =>
    round(xs.reduce((sum, x) => sum + x.km, 0) / xs.length);
  const races = snapshot.runs
    .filter(
      (r) =>
        r.race && r.date <= today && r.distanceKm >= 5 && r.durationSec > 0,
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = races[0];
  const previous = latest
    ? races
        .slice(1)
        .find(
          (r) =>
            Math.abs(r.distanceKm - latest.distanceKm) / latest.distanceKm <
              0.01 && r.date <= shift(latest.date, -14),
        )
    : undefined;
  const change =
    latest && previous
      ? (100 *
          (previous.durationSec / previous.distanceKm -
            latest.durationSec / latest.distanceKm)) /
        (previous.durationSec / previous.distanceKm)
      : null;
  return {
    recentAvg: avg(recent),
    earlierAvg: avg(earlier),
    recordedWeeks: recent.filter((w) => w.runs > 0).length,
    latest,
    previous,
    paceImprovement: change,
  };
}
export function formatTime(minutes: number) {
  const n = Math.round(minutes);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
export function pace(secPerKm: number) {
  const n = Math.round(secPerKm);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
export function exportCalendar(weeks: Week[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Milemark//Training//EN",
    "CALSCALE:GREGORIAN",
  ];
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z/, "Z");
  const escape = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  for (const w of weeks)
    for (const s of w.sessions)
      if (s.km > 0)
        lines.push(
          "BEGIN:VEVENT",
          `UID:${s.date}-${s.kind.replace(/ /g, "")}@milemark.local`,
          `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${s.date.replace(/-/g, "")}`,
          `DTEND;VALUE=DATE:${shift(s.date, 1).replace(/-/g, "")}`,
          `SUMMARY:${escape(`${s.kind} · ${round(s.km)} km`)}`,
          `DESCRIPTION:${escape(s.note)}`,
          "END:VEVENT",
        );
  return [...lines, "END:VCALENDAR"].join("\r\n");
}
