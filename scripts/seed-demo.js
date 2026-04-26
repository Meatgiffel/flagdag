import "dotenv/config";
import { prisma } from "../src/lib/db.js";
import { generateUniquePublicCode } from "../src/lib/public-code.js";

await prisma.event.deleteMany({ where: { title: "Demo flagdage" } });

const dates = [1, 3, 7].map((offset) => dateKeyFromOffset(offset));

const event = await prisma.$transaction(async (tx) => {
  const publicCode = await generateUniquePublicCode(tx);
  const createdEvent = await tx.event.create({
    data: {
      publicCode,
      title: "Demo flagdage",
      morningTime: "08:00",
      eveningTime: "18:00",
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

await prisma.$disconnect();

console.log(`Demo-event oprettet: http://localhost:${process.env.PORT ?? 3000}/e/${event.publicCode}`);

function dateKeyFromOffset(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
