import { test } from "node:test";
import assert from "node:assert/strict";
import {
  displayDistance,
  toKilometers,
  secondsPerUnit,
  distanceMessage,
} from "./units";
import { exportCalendar, generatePlan } from "./engine";
test("unit toggle is reversible and pace changes by the same physical factor", () => {
  assert.equal(toKilometers(1, "mi"), 1.609344);
  assert.ok(Math.abs(displayDistance(42.195, "mi") - 26.21876) < 0.0001);
  assert.equal(toKilometers(displayDistance(10, "mi"), "mi"), 10);
  assert.equal(displayDistance(10, "km"), 10);
  assert.ok(Math.abs(secondsPerUnit(300, "mi") - 482.8032) < 1e-9);
  assert.equal(
    distanceMessage("between 10 and 160 km", "mi"),
    "between 6.2 and 99.4 mi",
  );
});
test("calendar uses chosen units without changing stored plan distances", () => {
  const plan = generatePlan(
    {
      raceName: "Test",
      raceDate: "2027-04-25",
      goalMinutes: 240,
      days: 4,
      weeklyKm: 30,
      longestKm: 12,
      recentRaceKm: 0,
      recentRaceMinutes: 0,
    },
    "2026-10-15",
  );
  const before = JSON.stringify(plan);
  assert.ok(exportCalendar(plan.weeks, "mi").includes("Race · 26.2 mi"));
  assert.ok(exportCalendar(plan.weeks, "km").includes("Race · 42.2 km"));
  assert.equal(JSON.stringify(plan), before);
});
