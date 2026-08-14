const students = ["Aria Thakur", "Avery Steinberg", "Brady Lustig", "Vivienne Bukrinsky"];
const skills = [
  "Blessing over Talit",
  "Elohai Neshama",
  "Laasok",
  "Hamlamed",
  "limitless",
  "Yotzer",
  "Sunlight",
  "Habocher",
  "V'ahavta",
  "Adonai",
  "Meaning",
  "sheotchah",
  "Modim",
  "Receiving Torah",
  "Torah Blessing Before",
  "Torah Blessing After",
  "Haftorah Blessing Before",
  "Haftorah Blessing After"
];
const levels = ["red", "yellow", "green"];
const levelLabels = { green: "Mastered", yellow: "Learning", red: "Needs work" };
const storageKey = "mastery-map-statuses-v1";
const notesStorageKey = "mastery-map-notes-v1";
const learnerNotesStorageKey = "mastery-map-learner-notes-v1";

let selectedStudent = students[0];
let statuses = loadStatuses();
let notes = loadData(notesStorageKey);
let learnerNotes = loadData(learnerNotesStorageKey);
let activeNoteSkill = null;
let learnerNotesOpen = false;

const studentList = document.querySelector("#student-list");
const skillList = document.querySelector("#skill-list");
const dateInput = document.querySelector("#status-date");
const selectedName = document.querySelector("#selected-name");
const toast = document.querySelector("#toast");
const historyList = document.querySelector("#history-list");
const historySummary = document.querySelector("#history-summary");
const notesDialog = document.querySelector("#notes-dialog");
const notesTitle = document.querySelector("#notes-title");
const notesPerson = document.querySelector("#notes-person");
const notesEditor = document.querySelector("#notes-editor");
const learnerNotesEditor = document.querySelector("#learner-notes-editor");
const learnerNotesPanel = document.querySelector(".learner-notes");

dateInput.value = toLocalDate(new Date());

function loadStatuses() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch {
    return {};
  }
}

function loadData(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

function toLocalDate(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function initials(name) {
  return name.split(" ").map(part => part[0]).join("");
}

function recordKey(student, skill, date) {
  return `${student}::${skill}::${date}`;
}

function noteKey(student, skill) {
  return `${student}::${skill}`;
}

function recentSkillStatuses(skill, currentDate) {
  const prefix = `${selectedStudent}::${skill}::`;
  return Object.entries(statuses)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, level]) => ({ date: key.slice(prefix.length), level }))
    .filter(({ date }) => date !== currentDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 2);
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "numeric", day: "numeric"
  }).format(new Date(`${date}T12:00:00`));
}

function renderStudents() {
  studentList.innerHTML = students.map(student => `
    <div class="learner-option">
      <button class="student-button" role="option" aria-selected="${student === selectedStudent}" data-student="${student}">
        <span class="avatar" aria-hidden="true">${initials(student)}</span>
        <span>${student}</span>
      </button>
      <button class="doc-button" type="button" data-doc-student="${student}" aria-expanded="${learnerNotesOpen && student === selectedStudent}">Doc</button>
    </div>
  `).join("");
}

function renderLearnerNotes() {
  learnerNotesEditor.innerHTML = learnerNotes[selectedStudent] || "";
}

function renderSkills() {
  selectedName.textContent = selectedStudent.split(" ")[0];
  const date = dateInput.value;
  skillList.innerHTML = skills.map((skill, index) => {
    const current = statuses[recordKey(selectedStudent, skill, date)];
    const recent = recentSkillStatuses(skill, date);
    return `
      <div class="skill-row">
        <div class="skill-details"><span class="skill-number">ITEM ${String(index + 1).padStart(2, "0")}</span><button class="skill-name" data-note-skill="${skill}" aria-label="Open notes for ${skill}">${skill}${notes[noteKey(selectedStudent, skill)] ? '<span class="note-mark">NOTES</span>' : ""}</button></div>
        <div class="status-controls" aria-label="Mastery status for ${skill}">
          ${levels.map(level => `
            <button class="status-button ${level}${current === level ? " active" : ""}" data-skill="${skill}" data-level="${level}" aria-label="${levelLabels[level]}" aria-pressed="${current === level}" title="${levelLabels[level]}"></button>
          `).join("")}
          <button class="clear-button" data-clear-skill="${skill}" aria-label="Clear status" title="Clear status">×</button>
        </div>
        ${recent.length ? `<div class="recent-statuses" aria-label="Recent statuses for ${skill}">
          ${recent.map(({ date: recentDate, level }) => `<span class="recent-status" title="${formatDate(recentDate)}: ${levelLabels[level]}"><i class="recent-dot ${level}" aria-hidden="true"></i><time datetime="${recentDate}">${formatShortDate(recentDate)}</time></span>`).join("")}
        </div>` : ""}
      </div>`;
  }).join("");
}

function formatDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "long", day: "numeric"
  }).format(new Date(`${date}T12:00:00`));
}

function assessmentDates() {
  const prefix = `${selectedStudent}::`;
  return [...new Set(Object.keys(statuses)
    .filter(key => key.startsWith(prefix))
    .map(key => key.split("::")[2]))]
    .sort((a, b) => b.localeCompare(a));
}

function renderHistory() {
  const dates = assessmentDates();
  historySummary.textContent = dates.length
    ? `${dates.length} saved assessment${dates.length === 1 ? "" : "s"} for ${selectedStudent.split(" ")[0]}`
    : `No saved assessments for ${selectedStudent.split(" ")[0]} yet`;

  if (!dates.length) {
    historyList.innerHTML = `<div class="empty-history"><strong>No history yet</strong>Record a status above to begin this learner’s timeline.</div>`;
    return;
  }

  historyList.innerHTML = dates.map(date => `
    <article class="history-entry">
      <header class="history-date">
        <time datetime="${date}">${formatDate(date)}</time>
        <button type="button" data-history-date="${date}">View or edit</button>
      </header>
      <div class="history-items">
        ${skills.map(skill => {
          const status = statuses[recordKey(selectedStudent, skill, date)];
          return `<div class="history-item">
            <span class="history-item-name">${skill}</span>
            <span class="history-status ${status || "empty"}">${status ? levelLabels[status] : "Not rated"}</span>
          </div>`;
        }).join("")}
      </div>
    </article>
  `).join("");
}

function saveStatus(skill, level) {
  if (!dateInput.value) {
    dateInput.focus();
    dateInput.showPicker?.();
    return;
  }
  const key = recordKey(selectedStudent, skill, dateInput.value);
  statuses[key] = level;
  localStorage.setItem(storageKey, JSON.stringify(statuses));
  renderSkills();
  renderHistory();
  showToast();
}

function clearStatus(skill) {
  if (!dateInput.value) return;
  delete statuses[recordKey(selectedStudent, skill, dateInput.value)];
  localStorage.setItem(storageKey, JSON.stringify(statuses));
  renderSkills();
  renderHistory();
  showToast("Status cleared");
}

function openNotes(skill) {
  activeNoteSkill = skill;
  notesTitle.textContent = skill;
  notesPerson.textContent = selectedStudent;
  notesEditor.innerHTML = notes[noteKey(selectedStudent, skill)] || "";
  notesDialog.showModal();
  notesEditor.focus();
}

function showToast(message = "Progress saved") {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("visible"), 1400);
}

studentList.addEventListener("click", event => {
  const docButton = event.target.closest("[data-doc-student]");
  if (docButton) {
    const student = docButton.dataset.docStudent;
    learnerNotesOpen = selectedStudent !== student || !learnerNotesOpen;
    selectedStudent = student;
    learnerNotesPanel.hidden = !learnerNotesOpen;
    renderStudents();
    renderLearnerNotes();
    renderSkills();
    renderHistory();
    if (learnerNotesOpen) learnerNotesEditor.focus();
    return;
  }
  const button = event.target.closest("[data-student]");
  if (!button) return;
  selectedStudent = button.dataset.student;
  learnerNotesOpen = false;
  learnerNotesPanel.hidden = true;
  renderStudents();
  renderLearnerNotes();
  renderSkills();
  renderHistory();
});

skillList.addEventListener("click", event => {
  const noteButton = event.target.closest("[data-note-skill]");
  if (noteButton) {
    openNotes(noteButton.dataset.noteSkill);
    return;
  }
  const clearButton = event.target.closest("[data-clear-skill]");
  if (clearButton) {
    clearStatus(clearButton.dataset.clearSkill);
    return;
  }
  const button = event.target.closest("[data-level]");
  if (button) saveStatus(button.dataset.skill, button.dataset.level);
});

document.querySelector(".notes-toolbar").addEventListener("click", event => {
  const button = event.target.closest("[data-command]");
  if (!button) return;
  notesEditor.focus();
  document.execCommand(button.dataset.command, false);
});

document.querySelector(".learner-notes-toolbar").addEventListener("click", event => {
  const button = event.target.closest("[data-learner-command]");
  if (!button) return;
  learnerNotesEditor.focus();
  document.execCommand(button.dataset.learnerCommand, false);
});

document.querySelector("#save-learner-notes").addEventListener("click", () => {
  const content = learnerNotesEditor.innerHTML.trim();
  if (!learnerNotesEditor.textContent.trim()) delete learnerNotes[selectedStudent];
  else learnerNotes[selectedStudent] = content;
  localStorage.setItem(learnerNotesStorageKey, JSON.stringify(learnerNotes));
  showToast("Learner notes saved");
});

document.querySelector("#save-notes").addEventListener("click", () => {
  if (!activeNoteSkill) return;
  const key = noteKey(selectedStudent, activeNoteSkill);
  const content = notesEditor.innerHTML.trim();
  if (!notesEditor.textContent.trim()) delete notes[key];
  else notes[key] = content;
  localStorage.setItem(notesStorageKey, JSON.stringify(notes));
  notesDialog.close();
  renderSkills();
  showToast("Notes saved");
});

dateInput.addEventListener("change", renderSkills);

historyList.addEventListener("click", event => {
  const button = event.target.closest("[data-history-date]");
  if (!button) return;
  dateInput.value = button.dataset.historyDate;
  renderSkills();
  document.querySelector(".progress-section").scrollIntoView({ behavior: "smooth" });
});

renderStudents();
renderLearnerNotes();
renderSkills();
renderHistory();
