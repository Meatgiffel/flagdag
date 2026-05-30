import assert from "node:assert/strict";
import test from "node:test";
import {
  ROLE_LIMITS,
  dateFromKey,
  escapeHtml,
  groupedTrips,
  sortTrips,
  tripCounts,
  tripStatus,
} from "../src/lib/format.js";

test("escapeHtml escapes characters that can break HTML", () => {
  assert.equal(escapeHtml(`<script>alert("x")</script> & 'test'`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#039;test&#039;");
});

test("dateFromKey creates a stable local midday date", () => {
  const date = dateFromKey("2026-05-30");

  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 4);
  assert.equal(date.getDate(), 30);
  assert.equal(date.getHours(), 12);
});

test("sortTrips orders by date and then morning before evening", () => {
  const trips = [
    { id: "evening-later", dateKey: "2026-05-31", kind: "EVENING" },
    { id: "evening-first", dateKey: "2026-05-30", kind: "EVENING" },
    { id: "morning-first", dateKey: "2026-05-30", kind: "MORNING" },
  ];

  assert.deepEqual(
    sortTrips(trips).map((trip) => trip.id),
    ["morning-first", "evening-first", "evening-later"],
  );
});

test("groupedTrips groups sorted trips by date", () => {
  const groups = groupedTrips([
    { id: "b", dateKey: "2026-05-31", kind: "MORNING" },
    { id: "a", dateKey: "2026-05-30", kind: "EVENING" },
  ]);

  assert.deepEqual([...groups.keys()], ["2026-05-30", "2026-05-31"]);
  assert.deepEqual(
    [...groups.values()].map((trips) => trips.map((trip) => trip.id)),
    [["a"], ["b"]],
  );
});

test("tripCounts and tripStatus report open, almost full, and full trips", () => {
  const emptyTrip = { signups: [] };
  const almostFullTrip = {
    signups: [
      { role: "DRIVER" },
      { role: "HELPER" },
    ],
  };
  const fullTrip = {
    signups: [
      { role: "DRIVER" },
      { role: "HELPER" },
      { role: "HELPER" },
    ],
  };

  assert.deepEqual(tripCounts(fullTrip), {
    DRIVER: ROLE_LIMITS.DRIVER,
    HELPER: ROLE_LIMITS.HELPER,
  });
  assert.equal(tripStatus(emptyTrip).tone, "open");
  assert.equal(tripStatus(almostFullTrip).tone, "almost");
  assert.equal(tripStatus(fullTrip).tone, "full");
});
