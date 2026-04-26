const storageKey = "flagplan.volunteer";
const ownerKeyStorageKey = "flagplan.ownerKey";
const modal = document.querySelector("#signupModal");
const modalCard = modal?.querySelector(".modal-card");
const form = document.querySelector("#signupForm");
const roleInput = document.querySelector("#signupRole");
const tripInput = document.querySelector("#signupTripId");
const ownerKeyInput = document.querySelector("#ownerKey");
const roleLabel = document.querySelector("#signupRoleLabel");
const tripLabel = document.querySelector("#signupTripLabel");
const fields = ["firstName", "lastName", "phone", "email"];
let fallbackOwnerKey = "";

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "{}");
  } catch {
    return {};
  }
}

function saveProfile() {
  const profile = {};
  for (const field of fields) {
    const input = document.querySelector(`#${field}`);
    profile[field] = input?.value ?? "";
  }
  localStorage.setItem(storageKey, JSON.stringify(profile));
}

function getOwnerKey() {
  try {
    const existing = localStorage.getItem(ownerKeyStorageKey);
    if (existing) return existing;

    const key = crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(ownerKeyStorageKey, key);
    return key;
  } catch {
    if (!fallbackOwnerKey) {
      fallbackOwnerKey = `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
    }
    return fallbackOwnerKey;
  }
}

async function hashOwnerKey(ownerKey) {
  if (!crypto.subtle) return "";

  const bytes = new TextEncoder().encode(ownerKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function markOwnSignups() {
  const ownerKey = getOwnerKey();
  const ownerKeyHash = await hashOwnerKey(ownerKey);
  const profile = loadProfile();

  document.querySelectorAll("[data-signup-row]").forEach((row) => {
    const matchesOwnerKey = ownerKeyHash && row.dataset.ownerKeyHash === ownerKeyHash;
    const mayMatchOldSignup =
      !row.dataset.ownerKeyHash && profile.firstName && row.dataset.firstName === profile.firstName;

    if (!matchesOwnerKey && !mayMatchOldSignup) return;
    if (row.querySelector("[data-remove-own-signup]")) return;

    const form = document.createElement("form");
    form.method = "post";
    form.action = row.dataset.deleteUrl;
    form.className = "self-remove-form";
    form.dataset.removeOwnSignup = "true";

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "ownerKey";
    input.value = ownerKey;

    const firstNameInput = document.createElement("input");
    firstNameInput.type = "hidden";
    firstNameInput.name = "firstName";
    firstNameInput.value = profile.firstName ?? "";

    const phoneInput = document.createElement("input");
    phoneInput.type = "hidden";
    phoneInput.name = "phone";
    phoneInput.value = profile.phone ?? "";

    const emailInput = document.createElement("input");
    emailInput.type = "hidden";
    emailInput.name = "email";
    emailInput.value = profile.email ?? "";

    const button = document.createElement("button");
    button.type = "submit";
    button.className = "text-button self-remove-button";
    button.dataset.removeOwnSignup = "true";
    button.textContent = "Fjern mig";

    form.append(input, firstNameInput, phoneInput, emailInput, button);
    row.append(form);
  });
}

function applyProfile() {
  const profile = loadProfile();
  for (const field of fields) {
    const input = document.querySelector(`#${field}`);
    if (input && !input.value && profile[field]) input.value = profile[field];
  }
}

function openModal(trigger) {
  if (!modal || !trigger) return;

  roleInput.value = trigger.dataset.role;
  tripInput.value = trigger.dataset.tripId;
  if (ownerKeyInput) ownerKeyInput.value = getOwnerKey();
  roleLabel.textContent = trigger.dataset.roleLabel;
  tripLabel.textContent = trigger.dataset.tripLabel;

  applyProfile();
  modal.hidden = false;
  document.body.classList.add("modal-open");
  window.setTimeout(() => document.querySelector("#firstName")?.focus(), 0);
}

function closeModal() {
  if (!modal) return;

  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

applyProfile();
markOwnSignups().catch(() => {});

if (modal && !modal.hidden) {
  document.body.classList.add("modal-open");
  window.setTimeout(() => modalCard?.focus(), 0);
}

document.querySelectorAll("[data-signup-trigger]").forEach((button) => {
  button.addEventListener("click", () => openModal(button));
});

document.querySelectorAll("[data-modal-close]").forEach((button) => {
  button.addEventListener("click", closeModal);
});

modal?.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal && !modal.hidden) closeModal();
});

for (const field of fields) {
  document.querySelector(`#${field}`)?.addEventListener("input", saveProfile);
}

form?.addEventListener("submit", (event) => {
  saveProfile();
  if (ownerKeyInput) ownerKeyInput.value = getOwnerKey();

  const phone = document.querySelector("#phone")?.value.trim();
  const email = document.querySelector("#email")?.value.trim();

  if (!tripInput.value || !roleInput.value) {
    event.preventDefault();
    alert("Vælg en ledig plads på planen.");
    closeModal();
    return;
  }

  if (!phone && !email) {
    event.preventDefault();
    alert("Skriv telefon eller email.");
  }
});
