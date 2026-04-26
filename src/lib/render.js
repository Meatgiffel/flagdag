import {
  KIND_ACTIONS,
  KIND_LABELS,
  ROLE_LABELS,
  ROLE_LIMITS,
  dateFromKey,
  escapeHtml,
  formatDate,
  formatShortDate,
  groupedTrips,
  publicOrigin,
  tripCounts,
  tripStatus,
} from "./format.js";
import { icon } from "./icons.js";

const ASSET_VERSION = "11";

export function page({ title, body, session = null, scripts = [] }) {
  const scriptTags = scripts.map((src) => `<script src="${assetUrl(src)}" defer></script>`).join("");
  const user = session?.user;

  return `<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · FlagPlan</title>
  <link rel="stylesheet" href="${assetUrl("/styles.css")}">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/admin">
      <span class="brand-mark" aria-hidden="true">${icon("flag")}</span>
      <span>FlagPlan</span>
    </a>
    <nav class="nav">
      <a href="/admin">Admin</a>
      ${user ? `<span class="user">${escapeHtml(user.email ?? user.name ?? "Admin")}</span>` : ""}
      ${user ? `<form class="nav-form" method="post" action="/admin/logout"><button class="nav-link" type="submit">Log ud</button></form>` : ""}
    </nav>
  </header>
  <main class="page-shell">${body}</main>
  ${scriptTags}
</body>
</html>`;
}

function assetUrl(src) {
  const separator = src.includes("?") ? "&" : "?";
  return `${src}${separator}v=${ASSET_VERSION}`;
}

export function setupAuthPage(req = null) {
  return `<section class="narrow flow">
    <p class="eyebrow">Admin-login</p>
    <h1>Login mangler opsætning</h1>
    <p>Admin-delen bruger et lokalt Passport.js-login med bcrypt-hashet password. Der bruges ingen eksterne login-services.</p>
    <div class="setup-list">
      <div>
        <strong>1. Lav et password-hash</strong>
        <code>npm.cmd run auth:hash -- "dit-password"</code>
      </div>
      <div>
        <strong>2. Sæt værdier i .env</strong>
        <code>ADMIN_USERNAME="admin"</code>
        <code>ADMIN_PASSWORD_HASH="hash-fra-kommandoen"</code>
        <code>SESSION_SECRET="lang-tilfældig-tekst"</code>
      </div>
    </div>
    <p>Den offentlige del kan stadig bruges, når der findes events i databasen.</p>
    <a class="button secondary" href="/admin">${icon("home")}Til admin</a>
  </section>`;
}

export function adminLoginPage({ error = "", session = null, username = "admin" }) {
  const errorNotice = error
    ? `<div class="notice error">Login blev afvist. Tjek brugernavn og password.</div>`
    : "";

  return page({
    title: "Admin-login",
    session,
    body: `<section class="narrow flow">
      <p class="eyebrow">Admin-login</p>
      <h1>Log ind som admin</h1>
      ${errorNotice}
      <form class="panel form-grid" method="post" action="/admin/login">
        <label>
          <span>Brugernavn</span>
          <input name="username" autocomplete="username" required value="${escapeHtml(username)}">
        </label>
        <label>
          <span>Password</span>
          <input type="password" name="password" autocomplete="current-password" required autofocus>
        </label>
        <button class="button" type="submit">${icon("log-in")}Log ind</button>
      </form>
    </section>`,
  });
}

export function forbiddenPage(email) {
  return `<section class="narrow flow">
    <p class="eyebrow">Ingen adgang</p>
    <h1>Du er logget ind, men ikke som admin</h1>
    <p>Brugeren <strong>${escapeHtml(email ?? "ukendt")}</strong> matcher ikke <code>ADMIN_USERNAME</code>.</p>
    <a class="button secondary" href="/admin">${icon("home")}Til admin</a>
  </section>`;
}

export function adminDashboard({ events, session }) {
  const rows = events.length
    ? events
        .map(
          (event) => `<tr>
            <td>
              <strong>${escapeHtml(event.title)}</strong>
              <span class="muted block">${event.dates.length} datoer</span>
            </td>
            <td>${escapeHtml(event.morningTime)} / ${escapeHtml(event.eveningTime)}</td>
            <td><a href="/e/${event.publicCode}">/e/${event.publicCode}</a></td>
            <td class="right"><a class="button small secondary" href="/admin/events/${event.id}">${icon("external-link")}Åbn</a></td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="4"><div class="empty-row">Der er ikke oprettet events endnu.</div></td></tr>`;

  return page({
    title: "Admin",
    session,
    body: `<section class="section flow">
      <div class="toolbar">
        <div>
          <p class="eyebrow">Admin</p>
          <h1>Events</h1>
        </div>
        <a class="button" href="/admin/events/new">${icon("calendar-plus")}Opret event</a>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Tider</th>
              <th>Offentligt link</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`,
  });
}

export function newEventPage({ session, values = {}, error = "" }) {
  return page({
    title: "Opret event",
    session,
    scripts: ["/js/admin-event.js"],
    body: `<section class="section flow">
      <div class="toolbar">
        <div>
          <p class="eyebrow">Nyt event</p>
          <h1>Opret flagdage</h1>
        </div>
        <a class="button secondary" href="/admin">${icon("arrow-left")}Tilbage</a>
      </div>
      ${error ? `<div class="notice error">${escapeHtml(error)}</div>` : ""}
      <form class="panel form-grid" method="post" action="/admin/events">
        <label>
          <span>Navn på event</span>
          <input name="title" required maxlength="90" value="${escapeHtml(values.title ?? "")}" placeholder="Fx Byfest maj 2026">
        </label>

        <div class="two-cols">
          <label>
            <span>Morgen: flag op</span>
            <input type="time" name="morningTime" required value="${escapeHtml(values.morningTime ?? "08:00")}">
          </label>
          <label>
            <span>Aften: flag ned</span>
            <input type="time" name="eveningTime" required value="${escapeHtml(values.eveningTime ?? "18:00")}">
          </label>
        </div>

        <section class="date-picker" aria-labelledby="date-picker-title">
          <div>
            <h2 id="date-picker-title">Datoer</h2>
            <p>Vælg en dag ad gangen, eller tilføj et helt interval.</p>
          </div>

          <div class="date-tools">
            <label>
              <span>Enkel dato</span>
              <input type="date" id="singleDate">
            </label>
            <button class="button secondary" type="button" id="addSingleDate">${icon("plus")}Tilføj dato</button>
          </div>

          <div class="date-tools">
            <label>
              <span>Fra</span>
              <input type="date" id="rangeStart">
            </label>
            <label>
              <span>Til</span>
              <input type="date" id="rangeEnd">
            </label>
            <button class="button secondary" type="button" id="addDateRange">${icon("calendar-range")}Tilføj interval</button>
          </div>

          <input type="hidden" name="dates" id="selectedDatesInput" value="${escapeHtml(values.dates ?? "")}">
          <div class="selected-dates" id="selectedDates" aria-live="polite"></div>
        </section>

        <div class="form-actions">
          <button class="button" type="submit">${icon("save")}Opret event</button>
        </div>
      </form>
    </section>`,
  });
}

export function adminEventPage({ event, session, origin }) {
  const publicUrl = `${origin}/e/${event.publicCode}`;
  const grouped = groupedTrips(event.trips);
  const daySections = [...grouped.entries()]
    .map(([dateKey, trips]) => {
      const tripCards = trips.map((trip) => adminTripCard(trip)).join("");
      return `<section class="day-block">
        <h2>${escapeHtml(formatDate(dateKey))}</h2>
        <div class="trip-grid">${tripCards}</div>
      </section>`;
    })
    .join("");

  return page({
    title: event.title,
    session,
    body: `<section class="section flow">
      <div class="toolbar">
        <div>
          <p class="eyebrow">Admin event</p>
          <h1>${escapeHtml(event.title)}</h1>
        </div>
        <a class="button secondary" href="/admin">${icon("arrow-left")}Tilbage</a>
      </div>
      <div class="panel share-box">
        <div>
          <p class="eyebrow">Offentligt link</p>
          <a href="/e/${event.publicCode}">${escapeHtml(publicUrl)}</a>
        </div>
        <form method="post" action="/admin/events/${event.id}/delete" onsubmit="return confirm('Slet eventet og alle tilmeldinger?')">
          <button class="button danger" type="submit">${icon("trash-2")}Slet event</button>
        </form>
      </div>
      ${daySections}
    </section>`,
  });
}

function adminTripCard(trip) {
  const counts = tripCounts(trip);
  const signups = trip.signups.length
    ? trip.signups
        .map(
          (signup) => `<li>
            <div>
              <strong>${escapeHtml(signup.firstName)} ${escapeHtml(signup.lastName ?? "")}</strong>
              <span>${escapeHtml(ROLE_LABELS[signup.role] ?? signup.role)}</span>
              <span>${escapeHtml([signup.phone, signup.email].filter(Boolean).join(" · ") || "Ingen kontakt")}</span>
            </div>
            <form method="post" action="/admin/signups/${signup.id}/delete">
              <button class="text-button danger-text" type="submit">${icon("trash-2")}Fjern</button>
            </form>
          </li>`,
        )
        .join("")
    : `<li class="muted">Ingen tilmeldte endnu.</li>`;

  return `<article class="trip-card">
    <div class="trip-card-head">
      <div>
        <p class="eyebrow">${escapeHtml(KIND_LABELS[trip.kind] ?? trip.kind)}</p>
        <h3>${escapeHtml(KIND_ACTIONS[trip.kind] ?? trip.kind)} kl. ${escapeHtml(trip.kind === "MORNING" ? trip.event.morningTime : trip.event.eveningTime)}</h3>
      </div>
      ${statusPill(trip)}
    </div>
    <div class="slots">
      <span>Chauffør ${counts.DRIVER}/${ROLE_LIMITS.DRIVER}</span>
      <span>Hjælpere ${counts.HELPER}/${ROLE_LIMITS.HELPER}</span>
    </div>
    <ul class="signup-list">${signups}</ul>
  </article>`;
}

export function publicEventPage({ event, req, error = "", success = false, removed = false, values = {} }) {
  const grouped = groupedTrips(event.trips);
  const daySections = [...grouped.entries()]
    .map(([dateKey, trips]) => {
      const cards = trips.map((trip) => publicTripCard(trip)).join("");
      return `<section class="day-block">
        ${publicDayHeading(dateKey, trips)}
        <div class="trip-grid">${cards}</div>
      </section>`;
    })
    .join("");

  return page({
    title: event.title,
    scripts: ["/js/signup.js"],
    body: `<section class="public-layout">
      <div class="public-main flow">
        <div class="event-title">
          <p class="eyebrow">Flagplan</p>
          <h1>${escapeHtml(event.title)}</h1>
          <p>Klik på en ledig plads på en tur for at melde dig.</p>
        </div>
        ${success ? `<div class="notice success">Tak, din tilmelding er gemt.</div>` : ""}
        ${removed ? `<div class="notice success">Din tilmelding er fjernet.</div>` : ""}
        ${daySections}
      </div>
    </section>
    ${signupModal({ event, values, error })}`,
  });
}

function publicDayHeading(dateKey, trips) {
  const date = dateFromKey(dateKey);
  const weekday = capitalize(
    new Intl.DateTimeFormat("da-DK", {
      weekday: "long",
    }).format(date),
  );
  const day = new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
  }).format(date);
  const monthYear = new Intl.DateTimeFormat("da-DK", {
    month: "long",
    year: "numeric",
  }).format(date);
  return `<header class="day-heading">
    <div class="day-date">
      <span class="day-weekday">${escapeHtml(weekday)}</span>
      <span class="day-number">${escapeHtml(day)}</span>
      <span class="day-month">${escapeHtml(monthYear)}</span>
    </div>
  </header>`;
}

function publicTripCard(trip) {
  const counts = tripCounts(trip);
  const time = trip.kind === "MORNING" ? trip.event.morningTime : trip.event.eveningTime;
  const label = `${formatShortDate(trip.dateKey)} · ${KIND_LABELS[trip.kind] ?? trip.kind} kl. ${time}`;
  const publicNames = trip.signups.length
    ? trip.signups
        .map(
          (signup) => `<li
            data-signup-row
            data-signup-id="${signup.id}"
            data-first-name="${escapeHtml(signup.firstName)}"
            data-owner-key-hash="${escapeHtml(signup.ownerKeyHash ?? "")}"
            data-delete-url="/e/${trip.event.publicCode}/signups/${signup.id}/delete"
          >
            <span>${escapeHtml(signup.firstName)}</span>
            <span class="public-role">${escapeHtml(ROLE_LABELS[signup.role] ?? signup.role)}</span>
          </li>`,
        )
        .join("")
    : `<li class="muted">Ingen tilmeldte endnu.</li>`;

  return `<article class="trip-card">
    <div class="trip-card-head">
      <div>
        <p class="eyebrow">${escapeHtml(KIND_LABELS[trip.kind] ?? trip.kind)}</p>
        <h3>${escapeHtml(KIND_ACTIONS[trip.kind] ?? trip.kind)} kl. ${escapeHtml(time)}</h3>
      </div>
      ${statusPill(trip)}
    </div>
    <div class="slots">
      ${slotButton({ trip, role: "DRIVER", text: "Chauffør", count: counts.DRIVER, limit: ROLE_LIMITS.DRIVER, label })}
      ${slotButton({ trip, role: "HELPER", text: "Hjælpere", count: counts.HELPER, limit: ROLE_LIMITS.HELPER, label })}
    </div>
    <ul class="public-names">${publicNames}</ul>
  </article>`;
}

function capitalize(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function slotButton({ trip, role, text, count, limit, label }) {
  const full = count >= limit;
  return `<button
    class="slot-button ${full ? "full" : ""}"
    type="button"
    ${full ? "disabled" : ""}
    data-signup-trigger
    data-trip-id="${trip.id}"
    data-role="${role}"
    data-role-label="${escapeHtml(text)}"
    data-trip-label="${escapeHtml(label)}"
    aria-label="Meld dig som ${escapeHtml(text.toLowerCase())} på ${escapeHtml(label)}"
  >
    <span class="slot-icon">${icon(full ? "check" : "plus")}</span>
    <span>${escapeHtml(text)} ${count}/${limit}</span>
  </button>`;
}

function statusPill(trip) {
  const status = tripStatus(trip);
  return `<span class="pill ${status.tone}">${escapeHtml(status.text)}</span>`;
}

function signupModal({ event, values, error }) {
  const selectedTripId = Array.isArray(values.tripIds) ? values.tripIds[0] : values.tripIds;
  const selectedTrip = event.trips.find((trip) => trip.id === selectedTripId);
  const role = values.role === "DRIVER" ? "DRIVER" : "HELPER";
  const roleLabel = role === "DRIVER" ? "Chauffør" : "Hjælper";
  const tripLabel = selectedTrip ? modalTripLabel(selectedTrip) : "Valgt tur";

  return `<div class="modal-backdrop" id="signupModal" ${error ? "" : "hidden"}>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="signupModalTitle" tabindex="-1">
      <button class="icon-button modal-close" type="button" data-modal-close aria-label="Luk">${icon("x")}</button>
      <div>
        <p class="eyebrow" id="signupTripLabel">${escapeHtml(tripLabel)}</p>
        <h2 id="signupModalTitle">Meld dig som <span id="signupRoleLabel">${escapeHtml(roleLabel)}</span></h2>
      </div>
      ${error ? `<div class="notice error">${escapeHtml(error)}</div>` : ""}
      <form class="form-grid" method="post" action="/e/${event.publicCode}/signup" id="signupForm">
        <input type="hidden" name="role" id="signupRole" value="${escapeHtml(role)}">
        <input type="hidden" name="tripIds" id="signupTripId" value="${escapeHtml(selectedTripId ?? "")}">
        <input type="hidden" name="ownerKey" id="ownerKey" value="">
        <label>
          <span>Fornavn <small>vises offentligt</small></span>
          <input name="firstName" id="firstName" required autocomplete="given-name" value="${escapeHtml(values.firstName ?? "")}">
        </label>
        <label>
          <span>Efternavn <small>kun admin</small></span>
          <input name="lastName" id="lastName" autocomplete="family-name" value="${escapeHtml(values.lastName ?? "")}">
        </label>
        <div class="two-cols">
          <label>
            <span>Telefon <small>kun admin</small></span>
            <input name="phone" id="phone" autocomplete="tel" value="${escapeHtml(values.phone ?? "")}">
          </label>
          <label>
            <span>Email <small>kun admin</small></span>
            <input type="email" name="email" id="email" autocomplete="email" value="${escapeHtml(values.email ?? "")}">
          </label>
        </div>
        <input class="honeypot" name="company" tabindex="-1" autocomplete="off">
        <p class="muted">Skriv telefon eller email, så admin kan kontakte dig.</p>
        <div class="modal-actions">
          <button class="button secondary" type="button" data-modal-close>Fortryd</button>
          <button class="button" type="submit">${icon("user-plus")}Gem tilmelding</button>
        </div>
      </form>
    </div>
  </div>`;
}

function modalTripLabel(trip) {
  const time = trip.kind === "MORNING" ? trip.event.morningTime : trip.event.eveningTime;
  return `${formatShortDate(trip.dateKey)} · ${KIND_LABELS[trip.kind] ?? trip.kind} kl. ${time}`;
}

export function notFoundPage() {
  return page({
    title: "Ikke fundet",
    body: `<section class="narrow flow">
      <p class="eyebrow">404</p>
      <h1>Siden findes ikke</h1>
      <a class="button secondary" href="/admin">${icon("home")}Til admin</a>
    </section>`,
  });
}
