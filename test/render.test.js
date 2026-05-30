import assert from "node:assert/strict";
import test from "node:test";
import { adminDashboard, publicEventPage } from "../src/lib/render.js";

test("adminDashboard escapes event titles and renders direct public links", () => {
  const html = adminDashboard({
    session: { user: { email: "admin@example.test" } },
    events: [
      {
        id: "event-1",
        title: `<script>alert("x")</script>`,
        publicCode: "abc12345",
        morningTime: "08:00",
        eveningTime: "18:00",
        dates: [{ dateKey: "2026-05-30" }],
      },
    ],
  });

  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\("x"\)<\/script>/);
  assert.match(html, /href="\/e\/abc12345"/);
});

test("publicEventPage exposes only public signup names and escapes user data", () => {
  const event = {
    title: `Flagdag <test>`,
    publicCode: "abc12345",
    morningTime: "08:00",
    eveningTime: "18:00",
    dates: [{ dateKey: "2026-05-30" }],
    trips: [
      {
        id: "trip-1",
        eventId: "event-1",
        eventDateId: "date-1",
        dateKey: "2026-05-30",
        kind: "MORNING",
        event: {
          publicCode: "abc12345",
          morningTime: "08:00",
          eveningTime: "18:00",
        },
        signups: [
          {
            id: "signup-1",
            role: "HELPER",
            slotNumber: 1,
            firstName: `Ada <b>`,
            lastName: `Lovelace`,
            phone: "12345678",
            email: "ada@example.test",
            ownerKeyHash: "hash-1",
          },
          {
            id: "signup-2",
            role: "HELPER_RESERVE",
            slotNumber: 1,
            firstName: "Lin",
            lastName: "Reserve",
            phone: "22222222",
            email: "lin@example.test",
            ownerKeyHash: "hash-2",
          },
        ],
      },
    ],
  };

  const html = publicEventPage({ event, req: {}, success: true });

  assert.match(html, /Flagdag &lt;test&gt;/);
  assert.match(html, /Ada &lt;b&gt;/);
  assert.match(html, /Lin/);
  assert.match(html, /Reservehjælper \(ikke aktiv\)/);
  assert.doesNotMatch(html, /Lovelace/);
  assert.doesNotMatch(html, /lin@example\.test/);
  assert.doesNotMatch(html, /ada@example\.test/);
  assert.doesNotMatch(html, /12345678/);
  assert.doesNotMatch(html, /22222222/);
  assert.match(html, /Tak, din tilmelding er gemt/);
});
