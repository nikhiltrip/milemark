import { test } from "node:test";
import assert from "node:assert/strict";
import { adaptivePlan, normalizeTracking } from "./adaptation";
import { exportCalendar, generatePlan, shift } from "./engine";
import type { Settings, Snapshot } from "./types";

const today = "2026-11-10"; // Tuesday
const settings: Settings = {
  startDate: "2026-10-26",
  raceName: "Test marathon",
  raceDate: "2027-04-25",
  days: 4,
  weeklyKm: 40,
  longestKm: 16,
  goalMinutes: 240,
  recentRaceKm: 0,
  recentRaceMinutes: 0,
};
const empty: Snapshot = { runs: [], wellness: [] };
const session = (p: ReturnType<typeof adaptivePlan>, date: string) =>
  p.weeks.flatMap((w) => w.sessions).find((s) => s.date === date)!;
const template = generatePlan(settings, today);
const original = (date: string) =>
  template.weeks.flatMap((w) => w.sessions).find((s) => s.date === date)!;
const run = (date: string, km = 8) => ({
  id: date,
  date,
  name: "Recorded run",
  distanceKm: km,
  durationSec: 3000,
});

test("today's poor sleep changes calendar sessions, totals and ICS once", () => {
  const snapshot = { ...empty, wellness: [{ date: today, sleepHours: 5 }] };
  const plan = adaptivePlan(settings, snapshot, today);
  const adjusted = session(plan, today);
  assert.equal(adjusted.km, Math.round(original(today).km * 0.8 * 10) / 10);
  assert.equal(adjusted.kind, "Easy");
  assert.equal(adjusted.plannedKm, original(today).km);
  assert.match(
    exportCalendar(plan.weeks),
    new RegExp(`Easy · ${adjusted.km} km`),
  );
  for (const w of plan.weeks)
    assert.ok(
      Math.abs(w.km - w.sessions.reduce((sum, s) => sum + s.km, 0)) < 0.051,
    );
  assert.deepEqual(adaptivePlan(settings, snapshot, today), plan);
  assert.equal(original(today).km, adjusted.plannedKm);
});

test("repeated flags reserve easy sessions and a good new reading clears the buffer", () => {
  const snapshot = {
    ...empty,
    wellness: [0, 1].map((n) => ({ date: shift(today, -n), sleepScore: 40 })),
  };
  const plan = adaptivePlan(settings, snapshot, today);
  assert.equal(
    session(plan, today).km,
    Math.round(original(today).km * 0.7 * 10) / 10,
  );
  const thursday = shift(today, 2);
  assert.ok(session(plan, thursday).km < original(thursday).km);
  assert.equal(session(plan, thursday).kind, "Easy");
  const nextDay = shift(today, 1);
  snapshot.wellness.unshift({ date: nextDay, sleepScore: 85 });
  assert.equal(
    session(adaptivePlan(settings, snapshot, nextDay), thursday).km,
    original(thursday).km,
  );
});

test("missing, stale and future signals never alter today's session", () => {
  for (const wellness of [
    [],
    [{ date: shift(today, -1), sleepHours: 3 }],
    [{ date: shift(today, 1), sleepHours: 3 }],
  ]) {
    const plan = adaptivePlan(settings, { ...empty, wellness }, today);
    assert.equal(session(plan, today).km, original(today).km);
  }
});

test("a missed session is dropped; next run is easier without moving rest days", () => {
  const missedDate = "2026-11-08";
  const plan = adaptivePlan(settings, empty, today, {
    missedDates: [missedDate],
  });
  assert.equal(session(plan, missedDate).status, "missed");
  assert.equal(session(plan, missedDate).km, 0);
  assert.ok(session(plan, today).km < original(today).km);
  for (const date of ["2026-11-09", "2026-11-11"]) {
    assert.equal(session(plan, date).km, original(date).km);
  }
  assert.ok(
    !exportCalendar(plan.weeks).includes("DTSTART;VALUE=DATE:20261108"),
  );
});

test("missing data is unconfirmed until a completed import or journal confirmation", () => {
  assert.deepEqual(adaptivePlan(settings, empty, today).missedDates, []);
  assert.ok(
    adaptivePlan(settings, { ...empty, syncedAt: today + "T09:00:00Z" }, today)
      .missedDates.length > 0,
  );
  assert.ok(
    adaptivePlan(settings, empty, today, {
      missedDates: [],
      confirmedThrough: shift(today, -1),
    }).missedDates.length > 0,
  );
  const staleImport = { ...empty, syncedAt: "2026-10-25T09:00:00Z" };
  assert.deepEqual(adaptivePlan(settings, staleImport, today).missedDates, []);
  const limited = {
    ...empty,
    syncedAt: today + "T09:00:00Z",
    warnings: ["Activity import limited to the 1,000 most recent activities."],
  };
  assert.deepEqual(adaptivePlan(settings, limited, today).missedDates, []);
  assert.ok(
    !adaptivePlan(
      settings,
      { ...empty, syncedAt: today + "T09:00:00Z" },
      today,
    ).missedDates.includes(today),
  );
});

test("recorded runs override missed marks and sleep cuts, including duplicate IDs", () => {
  const snapshot = {
    runs: [run(today), run(today)],
    wellness: [{ date: today, sleepHours: 4 }],
  };
  const plan = adaptivePlan(settings, snapshot, today, {
    missedDates: [today],
  });
  assert.equal(session(plan, today).status, "completed");
  assert.equal(session(plan, today).km, original(today).km);
  assert.equal(plan.missedDates.length, 0);
});

test("an interrupted week reduces future targets without increasing any session or shifting race/taper", () => {
  const plan = adaptivePlan(settings, empty, today, {
    missedDates: ["2026-11-03", "2026-11-05"],
  });
  assert.ok(plan.messages.some((m) => m.includes("interrupted week")));
  const next = plan.weeks.find((w) => w.start === "2026-11-16")!;
  assert.ok(next.km < template.weeks.find((w) => w.start === next.start)!.km);
  for (const w of plan.weeks)
    for (const s of w.sessions) assert.ok(s.km <= original(s.date).km);
  assert.deepEqual(
    plan.weeks.map((w) => w.phase),
    template.weeks.map((w) => w.phase),
  );
  const race = session(plan, settings.raceDate);
  assert.equal(race.kind, "Race");
  assert.equal(race.km, 42.195);
});

test("race, rest, and completed sessions never gain or lose distance due to sleep", () => {
  const raceDay = shift(settings.raceDate, -1);
  const plan = adaptivePlan(
    settings,
    { ...empty, wellness: [{ date: raceDay, sleepHours: 3 }] },
    raceDay,
  );
  assert.equal(session(plan, raceDay).kind, "Rest");
  assert.equal(session(plan, settings.raceDate).km, 42.195);
});

test("manual decisions validate and plans ignore future missed marks", () => {
  assert.deepEqual(
    normalizeTracking({
      missedDates: [today, today, "bad", "2026-02-30"],
      confirmedThrough: "bad",
    }),
    { missedDates: [today], confirmedThrough: undefined },
  );
  assert.deepEqual(normalizeTracking(null), {
    missedDates: [],
    confirmedThrough: undefined,
  });
  const plan = adaptivePlan(settings, empty, today, {
    missedDates: [shift(today, 2)],
    confirmedThrough: shift(today, 10),
  });
  assert.deepEqual(plan.missedDates, []);
});

test("rebuild is anchored to the interrupted week and does not reset or disappear after two weeks", () => {
  const tracking = { missedDates: ["2026-11-03", "2026-11-05"] };
  const first = adaptivePlan(settings, empty, today, tracking);
  const later = adaptivePlan(settings, empty, "2026-11-17", tracking);
  assert.equal(
    session(first, "2026-11-19").km,
    session(later, "2026-11-19").km,
  );
  const december = adaptivePlan(settings, empty, "2026-12-01", tracking);
  assert.equal(
    session(first, "2026-12-03").km,
    session(december, "2026-12-03").km,
  );
  assert.ok(session(december, "2026-12-03").km < original("2026-12-03").km);
});
