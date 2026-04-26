export const ROLE_LIMITS = {
  DRIVER: 1,
  HELPER: 2,
};

export const ROLE_LABELS = {
  DRIVER: "Chauffør",
  HELPER: "Hjælper",
};

export const KIND_LABELS = {
  MORNING: "Morgen",
  EVENING: "Aften",
};

export const KIND_ACTIONS = {
  MORNING: "Flag op",
  EVENING: "Flag ned",
};

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("da-DK", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function dateFromKey(dateKey) {
  return new Date(`${dateKey}T12:00:00`);
}

export function formatDate(dateKey) {
  return dateFormatter.format(dateFromKey(dateKey));
}

export function formatShortDate(dateKey) {
  return shortDateFormatter.format(dateFromKey(dateKey));
}

export function sortTrips(trips) {
  const kindOrder = { MORNING: 1, EVENING: 2 };
  return [...trips].sort((a, b) => {
    const dateSort = a.dateKey.localeCompare(b.dateKey);
    if (dateSort !== 0) return dateSort;
    return (kindOrder[a.kind] ?? 99) - (kindOrder[b.kind] ?? 99);
  });
}

export function groupedTrips(trips) {
  return sortTrips(trips).reduce((groups, trip) => {
    if (!groups.has(trip.dateKey)) groups.set(trip.dateKey, []);
    groups.get(trip.dateKey).push(trip);
    return groups;
  }, new Map());
}

export function tripCounts(trip) {
  const counts = { DRIVER: 0, HELPER: 0 };
  for (const signup of trip.signups ?? []) {
    if (counts[signup.role] !== undefined) counts[signup.role] += 1;
  }
  return counts;
}

export function tripStatus(trip) {
  const counts = tripCounts(trip);
  const driverOpen = Math.max(ROLE_LIMITS.DRIVER - counts.DRIVER, 0);
  const helperOpen = Math.max(ROLE_LIMITS.HELPER - counts.HELPER, 0);
  const totalOpen = driverOpen + helperOpen;

  if (totalOpen === 0) return { tone: "full", text: "Fyldt" };
  if (totalOpen <= 1) return { tone: "almost", text: "Næsten fuld" };
  return { tone: "open", text: "Ledig" };
}

export function publicOrigin(req) {
  return `${req.protocol}://${req.get("host")}`;
}
