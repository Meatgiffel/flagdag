import "dotenv/config";
import { createHash } from "node:crypto";
import express from "express";
import { prisma } from "./lib/db.js";
import { adminUsername, authIsConfigured, getAdminSession, mountAuth, requireAdmin } from "./lib/auth.js";
import {
  adminDashboard,
  adminEventPage,
  adminLoginPage,
  homePage,
  newEventPage,
  notFoundPage,
  page,
  publicEventPage,
  setupAuthPage,
} from "./lib/render.js";
import { ROLE_LIMITS, publicOrigin, sortTrips } from "./lib/format.js";
import { generateUniquePublicCode } from "./lib/public-code.js";
import { eventFormSchema, normalizeTripIds, parseDates, signupSchema } from "./lib/validation.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.set("trust proxy", true);
app.use(express.urlencoded({ extended: false }));
app.use(express.static("src/public", { maxAge: 0 }));
mountAuth(app);

app.get("/", async (_req, res, next) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: { createdAt: "desc" },
      include: { dates: true },
      take: 12,
    });

    res.send(page({ title: "Forside", body: homePage({ events }) }));
  } catch (error) {
    next(error);
  }
});

app.get("/admin/login", async (req, res, next) => {
  try {
    if (!authIsConfigured()) {
      res.status(503).send(page({ title: "Login mangler opsætning", body: setupAuthPage(req) }));
      return;
    }

    const session = await getAdminSession(req);
    if (session) {
      res.redirect("/admin");
      return;
    }

    res.send(
      adminLoginPage({
        error: req.query.error,
        username: adminUsername(),
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.get("/admin", requireAdmin, async (_req, res, next) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: { createdAt: "desc" },
      include: { dates: true },
    });

    res.send(adminDashboard({ events, session: res.locals.session }));
  } catch (error) {
    next(error);
  }
});

app.get("/admin/events/new", requireAdmin, (req, res) => {
  res.send(newEventPage({ session: res.locals.session }));
});

app.post("/admin/events", requireAdmin, async (req, res, next) => {
  const parsed = eventFormSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).send(
      newEventPage({
        session: res.locals.session,
        values: req.body,
        error: "Udfyld titel, tider og mindst en dato.",
      }),
    );
    return;
  }

  let dates;
  try {
    dates = parseDates(parsed.data.dates);
  } catch (error) {
    res.status(400).send(
      newEventPage({
        session: res.locals.session,
        values: req.body,
        error: error.message,
      }),
    );
    return;
  }

  try {
    const event = await prisma.$transaction(async (tx) => {
      const publicCode = await generateUniquePublicCode(tx);
      const createdEvent = await tx.event.create({
        data: {
          title: parsed.data.title,
          publicCode,
          morningTime: parsed.data.morningTime,
          eveningTime: parsed.data.eveningTime,
        },
      });

      for (const dateKey of dates) {
        const eventDate = await tx.eventDate.create({
          data: {
            eventId: createdEvent.id,
            dateKey,
          },
        });

        await tx.trip.createMany({
          data: [
            {
              eventId: createdEvent.id,
              eventDateId: eventDate.id,
              dateKey,
              kind: "MORNING",
            },
            {
              eventId: createdEvent.id,
              eventDateId: eventDate.id,
              dateKey,
              kind: "EVENING",
            },
          ],
        });
      }

      return createdEvent;
    });

    res.redirect(`/admin/events/${event.id}`);
  } catch (error) {
    next(error);
  }
});

app.get("/admin/events/:id", requireAdmin, async (req, res, next) => {
  try {
    const event = await findEventForAdmin(req.params.id);
    if (!event) {
      res.status(404).send(notFoundPage());
      return;
    }

    res.send(adminEventPage({ event, session: res.locals.session, origin: publicOrigin(req) }));
  } catch (error) {
    next(error);
  }
});

app.post("/admin/events/:id/delete", requireAdmin, async (req, res, next) => {
  try {
    await prisma.event.delete({ where: { id: req.params.id } });
    res.redirect("/admin");
  } catch (error) {
    next(error);
  }
});

app.post("/admin/signups/:id/delete", requireAdmin, async (req, res, next) => {
  try {
    const signup = await prisma.signup.findUnique({
      where: { id: req.params.id },
      include: { trip: true },
    });

    if (!signup) {
      res.redirect("/admin");
      return;
    }

    await prisma.signup.delete({ where: { id: signup.id } });
    res.redirect(`/admin/events/${signup.trip.eventId}`);
  } catch (error) {
    next(error);
  }
});

app.get("/e/:code", async (req, res, next) => {
  try {
    const event = await findPublicEvent(req.params.code);
    if (!event) {
      res.status(404).send(notFoundPage());
      return;
    }

    res.send(
      publicEventPage({
        event,
        req,
        success: req.query.tak === "1",
        removed: req.query.fjernet === "1",
      }),
    );
  } catch (error) {
    next(error);
  }
});

app.post("/e/:code/signup", async (req, res, next) => {
  try {
    const event = await findPublicEvent(req.params.code);
    if (!event) {
      res.status(404).send(notFoundPage());
      return;
    }

    const parsed = signupSchema.safeParse({
      ...req.body,
      tripIds: normalizeTripIds(req.body.tripIds),
    });

    if (!parsed.success) {
      res.status(400).send(
        publicEventPage({
          event,
          req,
          error: parsed.error.issues[0]?.message ?? "Tilmeldingen mangler oplysninger.",
          values: {
            ...req.body,
            tripIds: normalizeTripIds(req.body.tripIds),
          },
        }),
      );
      return;
    }

    const selectedTripIds = [...new Set(parsed.data.tripIds)];
    const eventTripIds = new Set(event.trips.map((trip) => trip.id));
    const allTripsBelongToEvent = selectedTripIds.every((tripId) => eventTripIds.has(tripId));

    if (!allTripsBelongToEvent) {
      res.status(400).send(publicEventPage({ event, req, error: "En eller flere valgte ture findes ikke." }));
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const tripId of selectedTripIds) {
        await reserveSignupSlot(tx, {
          tripId,
          role: parsed.data.role,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName || null,
          phone: parsed.data.phone || null,
          email: parsed.data.email || null,
          ownerKeyHash: parsed.data.ownerKey ? hashOwnerKey(parsed.data.ownerKey) : null,
        });
      }
    });

    res.redirect(`/e/${event.publicCode}?tak=1`);
  } catch (error) {
    if (error instanceof SignupCapacityError) {
      const event = await findPublicEvent(req.params.code);
      res.status(409).send(
        publicEventPage({
          event,
          req,
          error: error.message,
          values: {
            ...req.body,
            tripIds: normalizeTripIds(req.body.tripIds),
          },
        }),
      );
      return;
    }

    next(error);
  }
});

app.post("/e/:code/signups/:id/delete", async (req, res, next) => {
  try {
    const ownerKey = String(req.body.ownerKey ?? "").trim();

    if (!ownerKey) {
      res.status(403).send(
        page({
          title: "Kan ikke fjerne tilmelding",
          body: `<section class="narrow flow">
            <p class="eyebrow">Tilmelding</p>
            <h1>Kan ikke fjerne tilmeldingen</h1>
            <p>Denne browser kan ikke bekræfte, at den oprettede tilmeldingen.</p>
            <a class="button secondary" href="/e/${req.params.code}">Tilbage til event</a>
          </section>`,
        }),
      );
      return;
    }

    const signup = await prisma.signup.findUnique({
      where: { id: req.params.id },
      include: { trip: { include: { event: true } } },
    });

    const ownerKeyHash = hashOwnerKey(ownerKey);
    const fallbackFirstName = String(req.body.firstName ?? "").trim();
    const fallbackPhone = String(req.body.phone ?? "").trim();
    const fallbackEmail = String(req.body.email ?? "").trim().toLowerCase();
    const contactMatches =
      (signup?.phone && signup.phone === fallbackPhone) ||
      (signup?.email && signup.email.toLowerCase() === fallbackEmail);
    const legacyIdentityMatches =
      !signup?.ownerKeyHash &&
      signup?.firstName === fallbackFirstName &&
      Boolean(contactMatches);
    const canDelete =
      signup?.trip?.event?.publicCode === req.params.code &&
      ((signup?.ownerKeyHash && signup.ownerKeyHash === ownerKeyHash) || legacyIdentityMatches);

    if (!canDelete) {
      res.status(403).send(
        page({
          title: "Kan ikke fjerne tilmelding",
          body: `<section class="narrow flow">
            <p class="eyebrow">Tilmelding</p>
            <h1>Kan ikke fjerne tilmeldingen</h1>
            <p>Kun den browser, der oprettede tilmeldingen, kan fjerne den her.</p>
            <a class="button secondary" href="/e/${req.params.code}">Tilbage til event</a>
          </section>`,
        }),
      );
      return;
    }

    await prisma.signup.delete({ where: { id: signup.id } });
    res.redirect(`/e/${req.params.code}?fjernet=1`);
  } catch (error) {
    next(error);
  }
});

app.use((_req, res) => {
  res.status(404).send(notFoundPage());
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).send(
    page({
      title: "Fejl",
      body: `<section class="narrow flow">
        <p class="eyebrow">Fejl</p>
        <h1>Noget gik galt</h1>
        <p>Prøv igen om lidt.</p>
        <a class="button secondary" href="/">Til forsiden</a>
      </section>`,
    }),
  );
});

app.listen(port, () => {
  console.log(`FlagPlan kører på http://localhost:${port}`);
});

async function findPublicEvent(publicCode) {
  const event = await prisma.event.findUnique({
    where: { publicCode },
    include: {
      dates: true,
      trips: {
        include: {
          event: true,
          signups: {
            orderBy: [{ role: "asc" }, { slotNumber: "asc" }],
          },
        },
      },
    },
  });

  if (!event) return null;
  event.trips = sortTrips(event.trips);
  return event;
}

async function findEventForAdmin(id) {
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      dates: true,
      trips: {
        include: {
          event: true,
          signups: {
            orderBy: [{ role: "asc" }, { slotNumber: "asc" }],
          },
        },
      },
    },
  });

  if (!event) return null;
  event.trips = sortTrips(event.trips);
  return event;
}

class SignupCapacityError extends Error {}

async function reserveSignupSlot(tx, data) {
  const limit = ROLE_LIMITS[data.role];
  if (!limit) throw new SignupCapacityError("Vælg enten chauffør eller hjælper.");

  for (let slotNumber = 1; slotNumber <= limit; slotNumber += 1) {
    try {
      await tx.signup.create({
        data: {
          ...data,
          slotNumber,
        },
      });
      return;
    } catch (error) {
      if (error?.code !== "P2002") throw error;
    }
  }

  throw new SignupCapacityError("Den valgte rolle er allerede fyldt på en af turene.");
}

function hashOwnerKey(ownerKey) {
  return createHash("sha256").update(ownerKey).digest("hex");
}
