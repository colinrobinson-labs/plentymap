// Distribution dates: holiday closures and reschedules, in the food banks' own wording.
// Run: node --test tests/
// Every case below is copied from a real San Diego listing (Nov 2026). A wrong date here means
// someone travels to a pantry that's closed, so these must stay green.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNotes, parseSchedule, resolveYears, nextTimes } from "../js/hours.js";

const REF = new Date("2026-11-20T18:48:15Z");
const NOW = new Date("2026-11-21T17:00:00Z"); // Saturday morning in San Diego
const sched = (when, notes, src = "sdfb") => {
  const s = parseSchedule(when, {}, REF);
  const nt = resolveYears(parseNotes(notes, src, REF), s, REF);
  return { rules: s.rules, once: s.once, except: s.except, skip: nt.skip, add: nt.add, moved: nt.moved, skipMonths: nt.skipMonths };
};
const dates = (sc, days = 45) => nextTimes(sc, NOW, 20, days).map(x => x.date);

test("named holidays become closure dates", () => {
  assert.deepEqual(parseNotes("Closed on Thanksgiving Day", "fsd", REF).skip, ["2026-11-26"]);
  assert.deepEqual(parseNotes("Closed the day after Thanksgiving", "fsd", REF).skip, ["2026-11-27"]);
  assert.deepEqual(parseNotes("Closed on Christmas Eve and New Year's Day", "fsd", REF).skip, ["2026-12-24", "2027-01-01"]);
  assert.deepEqual(parseNotes("Closed Memorial Day and Labor Day", "fsd", new Date("2027-03-01T00:00:00Z")).skip, ["2027-05-31", "2027-09-06"]);
  // the year we fill in for a holiday must not leak into the food bank's own bare dates
  assert.deepEqual(parseNotes("Closed Thanksgiving Day and 1/1", "fsd", REF).skip, ["2026-11-26", "Y-01-01"]);
});

test("a closure we can't pin to dates asks people to call first", () => {
  assert.equal(parseNotes("Closed Thanksgiving week", "fsd", REF).unclear, true);
  assert.equal(parseNotes("Closed over winter break", "fsd", REF).unclear, true);
});

test("Our Church: weekly Tuesday and Thursday, closed on Thanksgiving Day", () => {
  const s = parseSchedule("Tue 10:00 AM - 11:00 AM; Thu 10:00 AM - 11:00 AM", {}, REF);
  const nt = resolveYears(parseNotes("Closed on Thanksgiving Day", "fsd", REF), s, REF);
  const d = dates({ ...s, skip: nt.skip, add: [], moved: [], skipMonths: [] }, 10);
  assert.ok(d.includes("2026-11-24"));
  assert.ok(!d.includes("2026-11-26"));
});

test("a monthly date moved for the holidays replaces that month's date, however far it moved", () => {
  // National City Public Library: 4th Thursday, moved to Nov 2 and Dec 7
  const d = dates(sched("4th Thursday of each month from 8:00 am - 11:00 am", "Rescheduled Dates due to Holidays: November 2 & December 7"), 75);
  assert.ok(!d.includes("2026-11-26"), "not on Thanksgiving");
  assert.ok(!d.includes("2026-12-24"), "not on Christmas Eve");
  assert.ok(d.includes("2026-12-07"));
  assert.ok(d.includes("2027-01-28"), "January is back to normal");
});

test("a list of reschedule dates with a cancelled month and an inline move", () => {
  // Smart Food Foundation at Farr Elementary
  const nt = parseNotes("2026 Reschedule Dates: April 30, May 21, June 4, July Cancelled, August 27th rescheduled to August 20th, September 17, November 12, December 10, 2026.", "sdfb", REF);
  assert.deepEqual(nt.skipMonths, [7]);
  assert.deepEqual(nt.skip, ["2026-08-27"]);
  assert.deepEqual(nt.add, ["2026-08-20"]);
  assert.deepEqual(nt.moved, ["2026-04-30", "2026-05-21", "2026-06-04", "2026-09-17", "2026-11-12", "2026-12-10"]);
  const d = dates(sched("4th Thursday from 3:00 PM - 4:30 PM", "2026 Reschedule Dates: April 30, May 21, June 4, July Cancelled, August 27th rescheduled to August 20th, September 17, November 12, December 10, 2026."), 40);
  assert.deepEqual(d, ["2026-12-10"]);
});

test("weekly schedules still move only to a nearby date", () => {
  // a reschedule two weeks away must not swallow an unrelated weekly date
  const d = dates(sched("Every Wednesday 9:00 am - 11:00 am", "Rescheduled to: Dec 12"), 30);
  assert.ok(d.includes("2026-11-25") && d.includes("2026-12-02") && d.includes("2026-12-12"));
});

test("plain closure lists still work", () => {
  const d = dates(sched("Every Thursday 9:00 am - 12:00 pm", "Closed in 2026 on: Jan 1, Nov 11, Nov 26, Nov 27, Dec 25"), 14);
  assert.deepEqual(d, ["2026-12-03"]);
});
