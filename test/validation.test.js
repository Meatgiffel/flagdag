import assert from "node:assert/strict";
import test from "node:test";
import {
  eventFormSchema,
  normalizeTripIds,
  parseDates,
  passwordChangeSchema,
  signupSchema,
} from "../src/lib/validation.js";

test("parseDates trims, filters, de-duplicates, and sorts date keys", () => {
  assert.deepEqual(parseDates("2026-06-02, nope, 2026-05-30, 2026-05-30"), ["2026-05-30", "2026-06-02"]);
});

test("parseDates rejects input without any date keys", () => {
  assert.throws(() => parseDates("not-a-date"), /Vælg mindst en dato/);
});

test("normalizeTripIds accepts missing, single, and repeated form values", () => {
  assert.deepEqual(normalizeTripIds(undefined), []);
  assert.deepEqual(normalizeTripIds("trip-1"), ["trip-1"]);
  assert.deepEqual(normalizeTripIds(["trip-1", "", "trip-2"]), ["trip-1", "trip-2"]);
});

test("eventFormSchema accepts the minimum event fields", () => {
  const parsed = eventFormSchema.safeParse({
    title: "Flagdage",
    morningTime: "08:00",
    eveningTime: "18:00",
    dates: "2026-05-30",
  });

  assert.equal(parsed.success, true);
});

test("eventFormSchema rejects malformed times", () => {
  const parsed = eventFormSchema.safeParse({
    title: "Flagdage",
    morningTime: "25:00",
    eveningTime: "18:00",
    dates: "2026-05-30",
  });

  assert.equal(parsed.success, false);
});

test("signupSchema requires a contact method and keeps simple valid signups", () => {
  const parsed = signupSchema.safeParse({
    firstName: "Ada",
    phone: "12345678",
    role: "HELPER",
    tripIds: ["trip-1"],
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.lastName, "");
  assert.equal(parsed.data.email, "");
});

test("signupSchema accepts role-specific reserve signups", () => {
  for (const role of ["DRIVER_RESERVE", "HELPER_RESERVE"]) {
    const parsed = signupSchema.safeParse({
      firstName: "Ada",
      phone: "12345678",
      role,
      tripIds: ["trip-1"],
    });

    assert.equal(parsed.success, true);
  }
});

test("signupSchema rejects generic reserve signups", () => {
  const parsed = signupSchema.safeParse({
    firstName: "Ada",
    phone: "12345678",
    role: "RESERVE",
    tripIds: ["trip-1"],
  });

  assert.equal(parsed.success, false);
});

test("signupSchema rejects empty contact details and filled honeypot", () => {
  assert.equal(
    signupSchema.safeParse({
      firstName: "Ada",
      role: "HELPER",
      tripIds: ["trip-1"],
    }).success,
    false,
  );

  assert.equal(
    signupSchema.safeParse({
      firstName: "Ada",
      phone: "12345678",
      role: "HELPER",
      tripIds: ["trip-1"],
      company: "Spam Ltd",
    }).success,
    false,
  );
});

test("passwordChangeSchema requires matching and changed passwords", () => {
  assert.equal(
    passwordChangeSchema.safeParse({
      currentPassword: "old-password",
      newPassword: "new-password",
      confirmPassword: "new-password",
    }).success,
    true,
  );

  assert.equal(
    passwordChangeSchema.safeParse({
      currentPassword: "old-password",
      newPassword: "new-password",
      confirmPassword: "different",
    }).success,
    false,
  );

  assert.equal(
    passwordChangeSchema.safeParse({
      currentPassword: "same-password",
      newPassword: "same-password",
      confirmPassword: "same-password",
    }).success,
    false,
  );
});
