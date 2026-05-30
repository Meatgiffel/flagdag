import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, beforeEach } from "node:test";
import bcrypt from "bcryptjs";

const tempDir = await mkdtemp(path.join(tmpdir(), "flagplan-test-"));
const dbPath = path.join(tempDir, "test.db");
const adminPassword = "test-admin-password";

process.env.DATABASE_URL = `file:${dbPath}`;
process.env.SESSION_SECRET = "test-session-secret-with-enough-length";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(adminPassword, 4);
process.env.NODE_ENV = "test";

await import("../scripts/setup-db.js");
const { app } = await import("../src/server.js");
const { prisma } = await import("../src/lib/db.js");
const server = await listen(app);
const baseUrl = `http://127.0.0.1:${server.address().port}`;
let publicCodeCounter = 0;

beforeEach(async () => {
  await prisma.signup.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.eventDate.deleteMany();
  await prisma.event.deleteMany();
});

after(async () => {
  await close(server);
  await prisma.$disconnect();
  await rm(tempDir, { recursive: true, force: true });
});

test("admin can log in and create an event with trips for every date", async () => {
  const login = await postForm("/admin/login", {
    username: "admin",
    password: adminPassword,
  });
  const cookie = sessionCookie(login);

  assert.equal(login.status, 302);
  assert.equal(login.headers.get("location"), "/admin");
  assert.ok(cookie);

  const created = await postForm(
    "/admin/events",
    {
      title: "Maj flagdage",
      morningTime: "08:00",
      eveningTime: "18:00",
      dates: "2026-05-30,2026-05-31",
    },
    { cookie },
  );

  assert.equal(created.status, 302);
  assert.match(created.headers.get("location"), /^\/admin\/events\/.+/);

  const event = await prisma.event.findFirstOrThrow({
    include: {
      dates: true,
      trips: true,
    },
  });

  assert.equal(event.title, "Maj flagdage");
  assert.equal(event.dates.length, 2);
  assert.equal(event.trips.length, 4);
  assert.deepEqual(
    event.trips.map((trip) => `${trip.dateKey}:${trip.kind}`).sort(),
    ["2026-05-30:EVENING", "2026-05-30:MORNING", "2026-05-31:EVENING", "2026-05-31:MORNING"],
  );

  const publicPage = await fetch(`${baseUrl}/e/${event.publicCode}`);
  assert.equal(publicPage.status, 200);
  assert.match(await publicPage.text(), /Maj flagdage/);
});

test("public signup stores volunteers, keeps contact data private, and enforces helper capacity", async () => {
  const event = await createEvent();
  const morningTrip = event.trips.find((trip) => trip.kind === "MORNING");

  const first = await postForm(`/e/${event.publicCode}/signup`, {
    firstName: "Ada",
    phone: "11111111",
    role: "HELPER",
    tripIds: morningTrip.id,
    ownerKey: "owner-ada",
  });
  const second = await postForm(`/e/${event.publicCode}/signup`, {
    firstName: "Grace",
    email: "grace@example.test",
    role: "HELPER",
    tripIds: morningTrip.id,
    ownerKey: "owner-grace",
  });
  const overCapacity = await postForm(`/e/${event.publicCode}/signup`, {
    firstName: "Lin",
    phone: "22222222",
    role: "HELPER",
    tripIds: morningTrip.id,
    ownerKey: "owner-lin",
  });
  const reserve = await postForm(`/e/${event.publicCode}/signup`, {
    firstName: "Lin",
    phone: "22222222",
    role: "HELPER_RESERVE",
    tripIds: morningTrip.id,
    ownerKey: "owner-lin",
  });

  assert.equal(first.status, 302);
  assert.equal(first.headers.get("location"), `/e/${event.publicCode}?tak=1`);
  assert.equal(second.status, 302);
  assert.equal(overCapacity.status, 409);
  assert.equal(reserve.status, 302);

  const helperSignups = await prisma.signup.findMany({
    where: {
      tripId: morningTrip.id,
      role: "HELPER",
    },
    orderBy: {
      slotNumber: "asc",
    },
  });

  assert.deepEqual(
    helperSignups.map((signup) => [signup.firstName, signup.slotNumber]),
    [
      ["Ada", 1],
      ["Grace", 2],
    ],
  );
  const reserveSignup = await prisma.signup.findFirstOrThrow({
    where: {
      tripId: morningTrip.id,
      role: "HELPER_RESERVE",
    },
  });
  assert.equal(reserveSignup.firstName, "Lin");
  assert.equal(reserveSignup.slotNumber, 1);

  const publicPage = await fetch(`${baseUrl}/e/${event.publicCode}`);
  const html = await publicPage.text();

  assert.equal(publicPage.status, 200);
  assert.match(html, /Ada/);
  assert.match(html, /Grace/);
  assert.match(html, /Lin/);
  assert.match(html, /Reservehjælper \(ikke aktiv\)/);
  assert.match(html, /Hjælpere fyldt 2\/2 - skriv dig som backup/);
  assert.match(html, /data-role="HELPER_RESERVE"/);
  assert.doesNotMatch(html, /Reservechauffør \(ikke aktiv\)/);
  assert.doesNotMatch(html, /Chauffør fyldt 1\/1 - skriv dig som backup/);
  assert.doesNotMatch(html, /11111111/);
  assert.doesNotMatch(html, /grace@example\.test/);
  assert.doesNotMatch(html, /22222222/);
});

test("reserve signup is only allowed when the matching active role is full", async () => {
  const event = await createEvent();
  const morningTrip = event.trips.find((trip) => trip.kind === "MORNING");

  const earlyDriverReserve = await postForm(`/e/${event.publicCode}/signup`, {
    firstName: "Ada",
    phone: "11111111",
    role: "DRIVER_RESERVE",
    tripIds: morningTrip.id,
    ownerKey: "owner-ada",
  });
  const earlyHelperReserve = await postForm(`/e/${event.publicCode}/signup`, {
    firstName: "Grace",
    phone: "22222222",
    role: "HELPER_RESERVE",
    tripIds: morningTrip.id,
    ownerKey: "owner-grace",
  });

  assert.equal(earlyDriverReserve.status, 409);
  assert.equal(earlyHelperReserve.status, 409);

  await postForm(`/e/${event.publicCode}/signup`, {
    firstName: "Driver",
    phone: "33333333",
    role: "DRIVER",
    tripIds: morningTrip.id,
    ownerKey: "owner-driver",
  });
  await postForm(`/e/${event.publicCode}/signup`, {
    firstName: "Helper One",
    phone: "44444444",
    role: "HELPER",
    tripIds: morningTrip.id,
    ownerKey: "owner-helper-one",
  });

  const driverReserve = await postForm(`/e/${event.publicCode}/signup`, {
    firstName: "Driver Reserve",
    phone: "55555555",
    role: "DRIVER_RESERVE",
    tripIds: morningTrip.id,
    ownerKey: "owner-driver-reserve",
  });
  const stillEarlyHelperReserve = await postForm(`/e/${event.publicCode}/signup`, {
    firstName: "Helper Reserve",
    phone: "66666666",
    role: "HELPER_RESERVE",
    tripIds: morningTrip.id,
    ownerKey: "owner-helper-reserve",
  });

  assert.equal(driverReserve.status, 302);
  assert.equal(stillEarlyHelperReserve.status, 409);

  await postForm(`/e/${event.publicCode}/signup`, {
    firstName: "Helper Two",
    phone: "77777777",
    role: "HELPER",
    tripIds: morningTrip.id,
    ownerKey: "owner-helper-two",
  });

  const helperReserve = await postForm(`/e/${event.publicCode}/signup`, {
    firstName: "Helper Reserve",
    phone: "66666666",
    role: "HELPER_RESERVE",
    tripIds: morningTrip.id,
    ownerKey: "owner-helper-reserve",
  });

  assert.equal(helperReserve.status, 302);
  assert.equal(await prisma.signup.count({ where: { tripId: morningTrip.id, role: "DRIVER_RESERVE" } }), 1);
  assert.equal(await prisma.signup.count({ where: { tripId: morningTrip.id, role: "HELPER_RESERVE" } }), 1);
});

test("public signup rejects trips from another event", async () => {
  const visibleEvent = await createEvent();
  const otherEvent = await createEvent();
  const otherTrip = otherEvent.trips.find((trip) => trip.kind === "MORNING");

  const response = await postForm(`/e/${visibleEvent.publicCode}/signup`, {
    firstName: "Ada",
    phone: "11111111",
    role: "DRIVER",
    tripIds: otherTrip.id,
    ownerKey: "owner-ada",
  });

  assert.equal(response.status, 400);
  assert.equal(await prisma.signup.count(), 0);
});

test("public owner key can remove own signup, while a wrong owner key cannot", async () => {
  const event = await createEvent();
  const trip = event.trips.find((candidate) => candidate.kind === "MORNING");

  await postForm(`/e/${event.publicCode}/signup`, {
    firstName: "Ada",
    phone: "11111111",
    role: "DRIVER",
    tripIds: trip.id,
    ownerKey: "owner-ada",
  });

  const signup = await prisma.signup.findFirstOrThrow();
  const blocked = await postForm(`/e/${event.publicCode}/signups/${signup.id}/delete`, {
    ownerKey: "wrong-owner",
    firstName: "Ada",
    phone: "11111111",
  });

  assert.equal(blocked.status, 403);
  assert.equal(await prisma.signup.count(), 1);

  const removed = await postForm(`/e/${event.publicCode}/signups/${signup.id}/delete`, {
    ownerKey: "owner-ada",
  });

  assert.equal(removed.status, 302);
  assert.equal(removed.headers.get("location"), `/e/${event.publicCode}?fjernet=1`);
  assert.equal(await prisma.signup.count(), 0);
});

async function createEvent({ title = "Test flagdage", dates = ["2026-05-30"] } = {}) {
  publicCodeCounter += 1;
  const publicCode = `test${String(publicCodeCounter).padStart(4, "0")}`;

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        publicCode,
        title,
        morningTime: "08:00",
        eveningTime: "18:00",
      },
    });

    for (const dateKey of dates) {
      const eventDate = await tx.eventDate.create({
        data: {
          eventId: event.id,
          dateKey,
        },
      });

      await tx.trip.createMany({
        data: [
          {
            eventId: event.id,
            eventDateId: eventDate.id,
            dateKey,
            kind: "MORNING",
          },
          {
            eventId: event.id,
            eventDateId: eventDate.id,
            dateKey,
            kind: "EVENING",
          },
        ],
      });
    }

    return tx.event.findUniqueOrThrow({
      where: {
        id: event.id,
      },
      include: {
        dates: true,
        trips: true,
      },
    });
  });
}

async function postForm(pathname, fields, headers = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: formBody(fields),
    redirect: "manual",
  });
}

function formBody(fields) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined && value !== null) {
      params.append(key, value);
    }
  }

  return params;
}

function sessionCookie(response) {
  return response.headers.get("set-cookie")?.match(/flagplan\.sid=[^;]+/)?.[0] ?? "";
}

function listen(expressApp) {
  return new Promise((resolve) => {
    const listener = expressApp.listen(0, "127.0.0.1", () => resolve(listener));
  });
}

function close(listener) {
  return new Promise((resolve, reject) => {
    listener.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
