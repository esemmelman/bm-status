const students = [
  "Alex Pasternak",
  "Aria Thakur",
  "Avery Steinberg",
  "Brady Lustig",
  "Ellie Mueller",
  "Vivienne Bukrinsky"
];
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
const migrationStorageKey = "mastery-map-supabase-migrated-v1";
const syncIntervalMs = 30000;
const supabaseUrl = "https://fgomaujsdblpzxhnnqrg.supabase.co";
const supabasePublishableKey = "sb_publishable_JOUqLZDnfGu_yCa6k6FVDQ_AYwpr72i";
const database = window.supabase.createClient(supabaseUrl, supabasePublishableKey);

let selectedStudent = "Aria Thakur";
let statuses = loadStatuses();
let notes = loadData(notesStorageKey);
let learnerNotes = loadData(learnerNotesStorageKey);
let activeNoteSkill = null;
let learnerNotesOpen = false;
let syncInProgress = false;

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

function sanitizeRichText(html) {
  const template = document.createElement("template");
  const allowedTags = new Set(["B", "STRONG", "I", "EM", "UL", "OL", "LI", "P", "DIV", "BR"]);
  template.innerHTML = html;
  template.content.querySelectorAll("*").forEach(element => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      return;
    }
    [...element.attributes].forEach(attribute => element.removeAttribute(attribute.name));
  });
  return template.innerHTML;
}

async function migrateLocalData() {
  const statusRows = Object.entries(statuses).map(([key, level]) => {
    const [learner, skill, assessment_date] = key.split("::");
    return { learner, skill, assessment_date, level };
  });
  const skillNoteRows = Object.entries(notes).map(([key, content]) => {
    const [learner, skill] = key.split("::");
    return { learner, skill, content: sanitizeRichText(content) };
  });
  const learnerNoteRows = Object.entries(learnerNotes)
    .map(([learner, content]) => ({ learner, content: sanitizeRichText(content) }));

  if (!statusRows.length && !skillNoteRows.length && !learnerNoteRows.length) {
    localStorage.setItem(migrationStorageKey, "true");
    return;
  }

  const migrations = [];
  if (statusRows.length) migrations.push(database.from("bm_statuses").upsert(statusRows));
  if (skillNoteRows.length) migrations.push(database.from("bm_skill_notes").upsert(skillNoteRows));
  if (learnerNoteRows.length) migrations.push(database.from("bm_learner_notes").upsert(learnerNoteRows));

  const results = await Promise.all(migrations);
  const failure = results.find(result => result.error)?.error;
  if (failure) throw failure;

  localStorage.removeItem(storageKey);
  localStorage.removeItem(notesStorageKey);
  localStorage.removeItem(learnerNotesStorageKey);
  localStorage.setItem(migrationStorageKey, "true");
}

async function loadSupabaseData() {
  const [statusResult, skillNotesResult, learnerNotesResult] = await Promise.all([
    database.from("bm_statuses").select("learner, skill, assessment_date, level"),
    database.from("bm_skill_notes").select("learner, skill, content"),
    database.from("bm_learner_notes").select("learner, content")
  ]);
  const failure = [statusResult, skillNotesResult, learnerNotesResult]
    .find(result => result.error)?.error;
  if (failure) throw failure;

  statuses = Object.fromEntries(statusResult.data.map(row => [
    recordKey(row.learner, row.skill, row.assessment_date), row.level
  ]));
  notes = Object.fromEntries(skillNotesResult.data.map(row => [
    noteKey(row.learner, row.skill), sanitizeRichText(row.content)
  ]));
  learnerNotes = Object.fromEntries(learnerNotesResult.data.map(row => [
    row.learner, sanitizeRichText(row.content)
  ]));
}

function editorIsActive() {
  return document.activeElement === notesEditor || document.activeElement === learnerNotesEditor;
}

async function syncFromSupabase({ notify = false } = {}) {
  if (syncInProgress || !navigator.onLine || editorIsActive()) return;
  syncInProgress = true;
  try {
    await loadSupabaseData();
    renderStudents();
    renderLearnerNotes();
    renderSkills();
    renderHistory();
    if (notesDialog.open && activeNoteSkill) {
      notesEditor.innerHTML = notes[noteKey(selectedStudent, activeNoteSkill)] || "";
    }
    if (notify) showToast("Data synchronized");
  } catch (error) {
    console.error(error);
    if (notify) showToast("Could not synchronize data");
  } finally {
    syncInProgress = false;
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

function currentDateStamp() {
  const now = new Date();
  const hours = now.getHours();
  const displayHours = hours % 12 || 12;
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "pm" : "am";
  return `${now.getMonth() + 1}-${now.getDate()}-${now.getFullYear()} ${displayHours}:${minutes} ${period}`;
}

function appendCurrentDate(editor) {
  const hasContent = Boolean(editor.textContent.trim());
  const appendBlankLine = () => {
    const line = document.createElement("div");
    line.append(document.createElement("br"));
    editor.append(line);
    return line;
  };

  if (hasContent) {
    appendBlankLine();
    appendBlankLine();
  }

  const dateLine = document.createElement("div");
  const dateText = document.createElement("strong");
  dateText.textContent = currentDateStamp();
  dateLine.append(dateText);
  editor.append(dateLine);
  const cursorLine = appendBlankLine();
  editor.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(cursorLine, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  requestAnimationFrame(() => {
    editor.scrollTop = editor.scrollHeight;
  });
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

function focusEditorEnd(editor) {
  editor.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  requestAnimationFrame(() => {
    editor.scrollTop = editor.scrollHeight;
  });
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

async function saveStatus(skill, level) {
  if (!dateInput.value) {
    dateInput.focus();
    dateInput.showPicker?.();
    return;
  }
  const key = recordKey(selectedStudent, skill, dateInput.value);
  const previous = statuses[key];
  statuses[key] = level;
  renderSkills();
  renderHistory();
  const { error } = await database.from("bm_statuses").upsert({
    learner: selectedStudent,
    skill,
    assessment_date: dateInput.value,
    level,
    updated_at: new Date().toISOString()
  });
  if (error) {
    if (previous) statuses[key] = previous;
    else delete statuses[key];
    renderSkills();
    renderHistory();
    showToast("Could not save status");
    return;
  }
  showToast();
}

async function clearStatus(skill) {
  if (!dateInput.value) return;
  const key = recordKey(selectedStudent, skill, dateInput.value);
  const previous = statuses[key];
  delete statuses[key];
  renderSkills();
  renderHistory();
  const { error } = await database.from("bm_statuses").delete()
    .eq("learner", selectedStudent)
    .eq("skill", skill)
    .eq("assessment_date", dateInput.value);
  if (error) {
    if (previous) statuses[key] = previous;
    renderSkills();
    renderHistory();
    showToast("Could not clear status");
    return;
  }
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
    if (learnerNotesOpen) focusEditorEnd(learnerNotesEditor);
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
  if (event.target.closest("[data-insert-date]")) {
    appendCurrentDate(notesEditor);
    return;
  }
  const button = event.target.closest("[data-command]");
  if (!button) return;
  notesEditor.focus();
  document.execCommand(button.dataset.command, false);
});

document.querySelector(".learner-notes-toolbar").addEventListener("click", event => {
  if (event.target.closest("[data-learner-insert-date]")) {
    appendCurrentDate(learnerNotesEditor);
    return;
  }
  const button = event.target.closest("[data-learner-command]");
  if (!button) return;
  learnerNotesEditor.focus();
  document.execCommand(button.dataset.learnerCommand, false);
});

document.querySelector("#save-learner-notes").addEventListener("click", async () => {
  const content = sanitizeRichText(learnerNotesEditor.innerHTML.trim());
  let error;
  if (!learnerNotesEditor.textContent.trim()) {
    ({ error } = await database.from("bm_learner_notes").delete()
      .eq("learner", selectedStudent));
    if (!error) delete learnerNotes[selectedStudent];
  } else {
    ({ error } = await database.from("bm_learner_notes").upsert({
      learner: selectedStudent,
      content,
      updated_at: new Date().toISOString()
    }));
    if (!error) learnerNotes[selectedStudent] = content;
  }
  if (error) {
    showToast("Could not save learner notes");
    return;
  }
  showToast("Learner notes saved");
});

document.querySelector("#save-notes").addEventListener("click", async () => {
  if (!activeNoteSkill) return;
  const key = noteKey(selectedStudent, activeNoteSkill);
  const content = sanitizeRichText(notesEditor.innerHTML.trim());
  let error;
  if (!notesEditor.textContent.trim()) {
    ({ error } = await database.from("bm_skill_notes").delete()
      .eq("learner", selectedStudent)
      .eq("skill", activeNoteSkill));
    if (!error) delete notes[key];
  } else {
    ({ error } = await database.from("bm_skill_notes").upsert({
      learner: selectedStudent,
      skill: activeNoteSkill,
      content,
      updated_at: new Date().toISOString()
    }));
    if (!error) notes[key] = content;
  }
  if (error) {
    showToast("Could not save item notes");
    return;
  }
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

async function initialize() {
  try {
    await migrateLocalData();
    await loadSupabaseData();
  } catch (error) {
    console.error(error);
    showToast("Could not connect to database");
  }
  renderStudents();
  renderLearnerNotes();
  renderSkills();
  renderHistory();

  window.setInterval(syncFromSupabase, syncIntervalMs);
  window.addEventListener("focus", () => syncFromSupabase());
  window.addEventListener("online", () => syncFromSupabase({ notify: true }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncFromSupabase();
  });
}

initialize();
