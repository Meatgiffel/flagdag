import "dotenv/config";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const dbPath = resolveSqlitePath(databaseUrl);

mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec(`
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "Event" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "publicCode" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "morningTime" TEXT NOT NULL,
  "eveningTime" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "EventDate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  CONSTRAINT "EventDate_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Trip" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "eventDateId" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  CONSTRAINT "Trip_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Trip_eventDateId_fkey"
    FOREIGN KEY ("eventDateId") REFERENCES "EventDate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Signup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tripId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "slotNumber" INTEGER NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "ownerKeyHash" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Signup_tripId_fkey"
    FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Event_publicCode_key" ON "Event"("publicCode");
CREATE INDEX IF NOT EXISTS "EventDate_dateKey_idx" ON "EventDate"("dateKey");
CREATE UNIQUE INDEX IF NOT EXISTS "EventDate_eventId_dateKey_key" ON "EventDate"("eventId", "dateKey");
CREATE INDEX IF NOT EXISTS "Trip_eventId_dateKey_idx" ON "Trip"("eventId", "dateKey");
CREATE UNIQUE INDEX IF NOT EXISTS "Trip_eventDateId_kind_key" ON "Trip"("eventDateId", "kind");
CREATE INDEX IF NOT EXISTS "Signup_tripId_role_idx" ON "Signup"("tripId", "role");
CREATE UNIQUE INDEX IF NOT EXISTS "Signup_tripId_role_slotNumber_key" ON "Signup"("tripId", "role", "slotNumber");
`);

const signupColumns = db
  .prepare('PRAGMA table_info("Signup")')
  .all()
  .map((column) => column.name);

if (!signupColumns.includes("ownerKeyHash")) {
  db.exec('ALTER TABLE "Signup" ADD COLUMN "ownerKeyHash" TEXT;');
}

db.exec('CREATE INDEX IF NOT EXISTS "Signup_ownerKeyHash_idx" ON "Signup"("ownerKeyHash");');

db.close();

console.log(`Database klar: ${dbPath}`);

function resolveSqlitePath(url) {
  if (!url.startsWith("file:")) {
    throw new Error("DATABASE_URL skal starte med file: for SQLite.");
  }

  const rawPath = url.slice("file:".length);
  const normalized = rawPath.replaceAll("\\", "/");
  const windowsAbsolute = /^[a-zA-Z]:\//.test(normalized);

  if (path.isAbsolute(rawPath) || windowsAbsolute) {
    return rawPath;
  }

  return path.resolve(process.cwd(), "prisma", rawPath);
}
