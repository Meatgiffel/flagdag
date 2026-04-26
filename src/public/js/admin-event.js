const selectedInput = document.querySelector("#selectedDatesInput");
const selectedDates = document.querySelector("#selectedDates");
const singleDate = document.querySelector("#singleDate");
const addSingleDate = document.querySelector("#addSingleDate");
const rangeStart = document.querySelector("#rangeStart");
const rangeEnd = document.querySelector("#rangeEnd");
const addDateRange = document.querySelector("#addDateRange");

const dates = new Set(
  (selectedInput?.value ?? "")
    .split(",")
    .map((date) => date.trim())
    .filter(Boolean),
);

function renderDates() {
  const sorted = [...dates].sort();
  selectedInput.value = sorted.join(",");

  if (sorted.length === 0) {
    selectedDates.innerHTML = '<p class="muted">Ingen datoer valgt endnu.</p>';
    return;
  }

  selectedDates.innerHTML = sorted
    .map(
      (date) => `<span class="date-chip">
        ${formatDate(date)}
        <button type="button" aria-label="Fjern ${date}" data-remove-date="${date}">×</button>
      </span>`,
    )
    .join("");
}

function formatDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day, 12));
}

function addDate(date) {
  if (!date) return;
  dates.add(date);
  renderDates();
}

function addRange(start, end) {
  if (!start || !end) return;

  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const first = startDate <= endDate ? startDate : endDate;
  const last = startDate <= endDate ? endDate : startDate;

  for (const date = new Date(first); date <= last; date.setDate(date.getDate() + 1)) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    dates.add(`${year}-${month}-${day}`);
  }

  renderDates();
}

addSingleDate?.addEventListener("click", () => {
  addDate(singleDate.value);
  singleDate.value = "";
  singleDate.focus();
});

addDateRange?.addEventListener("click", () => {
  addRange(rangeStart.value, rangeEnd.value);
});

selectedDates?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-date]");
  if (!button) return;

  dates.delete(button.dataset.removeDate);
  renderDates();
});

document.querySelector("form")?.addEventListener("submit", (event) => {
  if (dates.size === 0) {
    event.preventDefault();
    selectedDates.focus();
    alert("Vælg mindst en dato.");
  }
});

renderDates();
