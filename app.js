const STORAGE_KEY = "swipequest-state-v1";
const LEGACY_STORAGE_KEY = "task-crush-state-v1";
const THEME_STORAGE_KEY = "swipequest-theme-v1";
const ALLOWED_THEMES = new Set(["cherry-editorial", "after-dark"]);
const WHATSAPP_MAX_FILE_BYTES = 10 * 1024 * 1024;
const BACKUP_MAX_FILE_BYTES = 5 * 1024 * 1024;
const WHATSAPP_RENDER_LIMIT = 250;

const CATEGORY_COLORS = {
  "👑 Empire Building": "#8d2f62",
  "🛸 Office Grind": "#536176",
  "💪 Glow Up": "#3f765b",
  "🛵 Freedom & Adulting": "#9a6400",
  "🎨 Creator Mode": "#8f3a7b",
  "🌍 Explore & Social": "#276b95",
  "🕉 Faith & Regulation": "#a54e35",
};

const STARTER_TASKS = [
  {
    title: "Crack one CP question",
    notes: "Read it once, write three observations, and give it one honest lock-in block.",
    category: "👑 Empire Building",
    estimateMinutes: 60,
    energy: "deep",
  },
  {
    title: "Take a no-scroll walk",
    notes: "Let the body process the lore without feeding the scroll monster.",
    category: "💪 Glow Up",
    estimateMinutes: 30,
    energy: "low",
  },
  {
    title: "Unblock one office side quest",
    notes: "Open the ticket. Find the tiniest visible move. Do only that first.",
    category: "🛸 Office Grind",
    estimateMinutes: 45,
    energy: "medium",
  },
];

const els = {
  waitingCount: document.querySelector("#waitingCount"),
  doneTodayCount: document.querySelector("#doneTodayCount"),
  focusMinutesCount: document.querySelector("#focusMinutesCount"),
  taskDeck: document.querySelector("#taskDeck"),
  swipeActions: document.querySelector("#swipeActions"),
  taskList: document.querySelector("#taskList"),
  taskSearch: document.querySelector("#taskSearch"),
  focusContent: document.querySelector("#focusContent"),
  winsList: document.querySelector("#winsList"),
  taskDialog: document.querySelector("#taskDialog"),
  taskForm: document.querySelector("#taskForm"),
  taskDialogTitle: document.querySelector("#taskDialogTitle"),
  taskId: document.querySelector("#taskId"),
  taskTitle: document.querySelector("#taskTitle"),
  taskCategory: document.querySelector("#taskCategory"),
  taskEstimate: document.querySelector("#taskEstimate"),
  taskEnergy: document.querySelector("#taskEnergy"),
  taskNotes: document.querySelector("#taskNotes"),
  importFile: document.querySelector("#importFile"),
  whatsappDialog: document.querySelector("#whatsappDialog"),
  whatsappFile: document.querySelector("#whatsappFile"),
  whatsappFileStep: document.querySelector("#whatsappFileStep"),
  whatsappPreview: document.querySelector("#whatsappPreview"),
  whatsappFileName: document.querySelector("#whatsappFileName"),
  whatsappSummary: document.querySelector("#whatsappSummary"),
  whatsappSearch: document.querySelector("#whatsappSearch"),
  whatsappShowAll: document.querySelector("#whatsappShowAll"),
  whatsappCandidateList: document.querySelector("#whatsappCandidateList"),
  whatsappVisibleCount: document.querySelector("#whatsappVisibleCount"),
  whatsappSelectedCount: document.querySelector("#whatsappSelectedCount"),
  importSelectedWhatsApp: document.querySelector("#importSelectedWhatsApp"),
  toast: document.querySelector("#toast"),
  themeToggle: document.querySelector("#themeToggle"),
  themeColor: document.querySelector("#themeColor"),
};

let activeView = "swipe";
let listFilter = "waiting";
let toastTimer = null;
let timerInterval = null;
let whatsappCandidates = [];
let whatsappImportStats = null;
let whatsappRenderCount = WHATSAPP_RENDER_LIMIT;
let state = loadState();

function currentTheme() {
  return document.documentElement?.dataset?.theme === "after-dark" ? "after-dark" : "cherry-editorial";
}

function applyTheme(theme, persist = true) {
  const safeTheme = ALLOWED_THEMES.has(theme) ? theme : "cherry-editorial";
  const isAfterDark = safeTheme === "after-dark";
  if (document.documentElement?.dataset) document.documentElement.dataset.theme = safeTheme;
  els.themeToggle?.setAttribute?.("aria-pressed", String(isAfterDark));
  els.themeToggle?.classList.toggle("is-active", isAfterDark);
  if (els.themeColor) els.themeColor.content = isAfterDark ? "#141315" : "#f8f1e7";
  if (!persist) return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, safeTheme);
  } catch (error) {
    console.warn("Could not save SwipeQuest theme", error);
  }
}

function toggleTheme() {
  const nextTheme = currentTheme() === "after-dark" ? "cherry-editorial" : "after-dark";
  applyTheme(nextTheme);
  showToast(nextTheme === "after-dark" ? "After Dark activated ✦" : "Cherry Editorial is back ♡");
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "id") {
  if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createTask(input) {
  const timestamp = nowIso();
  return {
    id: makeId("task"),
    title: input.title.trim(),
    notes: input.notes?.trim() || "",
    category: input.category || "👑 Empire Building",
    estimateMinutes: Number(input.estimateMinutes) || 60,
    energy: input.energy || "medium",
    status: "waiting",
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    completedAt: null,
    passCount: 0,
  };
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function safeId(value, prefix) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(value)
    ? value
    : makeId(prefix);
}

function safeIso(value) {
  if (typeof value !== "string" || value.length > 64) return null;
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function normalizeStoredState(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.tasks) || !Array.isArray(input.sessions)) return null;
  const validCategories = new Set(Object.keys(CATEGORY_COLORS));
  const validStatuses = new Set(["waiting", "active", "done"]);
  const validEnergies = new Set(["low", "medium", "deep"]);

  const tasks = input.tasks.slice(0, 5000).flatMap((rawTask) => {
    if (!rawTask || typeof rawTask !== "object") return [];
    const title = typeof rawTask.title === "string" ? rawTask.title.trim().slice(0, 140) : "";
    if (!title) return [];
    const task = {
      id: safeId(rawTask.id, "task"),
      title,
      notes: typeof rawTask.notes === "string" ? rawTask.notes.trim().slice(0, 500) : "",
      category: validCategories.has(rawTask.category) ? rawTask.category : "👑 Empire Building",
      estimateMinutes: Math.round(boundedNumber(rawTask.estimateMinutes, 60, 1, 720)),
      energy: validEnergies.has(rawTask.energy) ? rawTask.energy : "medium",
      status: validStatuses.has(rawTask.status) ? rawTask.status : "waiting",
      createdAt: safeIso(rawTask.createdAt) || nowIso(),
      updatedAt: safeIso(rawTask.updatedAt) || nowIso(),
      startedAt: safeIso(rawTask.startedAt),
      completedAt: safeIso(rawTask.completedAt),
      passCount: Math.round(boundedNumber(rawTask.passCount, 0, 0, 100000)),
    };
    if (rawTask.importSource?.type === "whatsapp" && typeof rawTask.importSource.fingerprint === "string") {
      task.importSource = {
        type: "whatsapp",
        fingerprint: rawTask.importSource.fingerprint.replace(/[^A-Za-z0-9-]/g, "").slice(0, 180),
      };
    }
    return [task];
  });

  const taskIds = new Set(tasks.map((task) => task.id));
  const sessions = input.sessions.slice(0, 10000).flatMap((rawSession) => {
    if (!rawSession || typeof rawSession !== "object") return [];
    const taskTitle = typeof rawSession.taskTitle === "string" ? rawSession.taskTitle.trim().slice(0, 140) : "";
    const endedAt = safeIso(rawSession.endedAt);
    if (!taskTitle || !endedAt) return [];
    return [{
      id: safeId(rawSession.id, "session"),
      taskId: safeId(rawSession.taskId, "task"),
      taskTitle,
      category: validCategories.has(rawSession.category) ? rawSession.category : "👑 Empire Building",
      startedAt: safeIso(rawSession.startedAt) || endedAt,
      endedAt,
      durationSeconds: Math.round(boundedNumber(rawSession.durationSeconds, 0, 0, 31536000)),
      outcome: rawSession.outcome === "partial" ? "partial" : "completed",
      source: rawSession.source === "swipe" ? "swipe" : "list",
    }];
  });

  let activeSession = null;
  if (input.activeSession && typeof input.activeSession === "object" && taskIds.has(input.activeSession.taskId)) {
    activeSession = {
      id: safeId(input.activeSession.id, "session"),
      taskId: input.activeSession.taskId,
      source: input.activeSession.source === "swipe" ? "swipe" : "list",
      targetSeconds: Math.round(boundedNumber(input.activeSession.targetSeconds, 3600, 60, 43200)),
      startedAtMs: boundedNumber(input.activeSession.startedAtMs, Date.now(), 0, Date.now() + 86400000),
      accumulatedSeconds: boundedNumber(input.activeSession.accumulatedSeconds, 0, 0, 31536000),
      paused: Boolean(input.activeSession.paused),
    };
  }

  tasks.forEach((task) => {
    if (activeSession?.taskId === task.id) task.status = "active";
    else if (task.status === "active") task.status = "waiting";
  });

  const imports = Array.isArray(input.imports) ? input.imports.slice(0, 1000).flatMap((rawImport) => {
    if (!rawImport || rawImport.type !== "whatsapp" || typeof rawImport.fingerprint !== "string") return [];
    return [{
      id: safeId(rawImport.id, "import"),
      type: "whatsapp",
      fingerprint: rawImport.fingerprint.replace(/[^A-Za-z0-9-]/g, "").slice(0, 180),
      importedAt: safeIso(rawImport.importedAt) || nowIso(),
      taskCount: Math.round(boundedNumber(rawImport.taskCount, 0, 0, 5000)),
    }];
  }) : [];

  return { version: 1, tasks, sessions, activeSession, imports };
}

function freshState() {
  return {
    version: 1,
    tasks: STARTER_TASKS.map(createTask),
    sessions: [],
    activeSession: null,
    imports: [],
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!saved) return freshState();
    const parsed = JSON.parse(saved);
    return normalizeStoredState(parsed) || freshState();
  } catch (error) {
    console.warn("Could not load saved SwipeQuest data", error);
    return freshState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.warn("Could not save SwipeQuest data", error);
    showToast("Browser storage is full — export a backup before adding more");
    return false;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isToday(iso) {
  if (!iso) return false;
  const date = new Date(iso);
  const today = new Date();
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

function formatDateTime(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDuration(totalSeconds = 0) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2600);
}

function setView(view) {
  activeView = view;
  document.querySelectorAll(".view").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.view === view);
  });
  document.querySelectorAll(".nav-item").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.viewTarget === view);
  });
  if (view === "focus") renderFocus();
  if (view === "tasks") renderTaskList();
  if (view === "wins") renderWins();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function waitingTasks() {
  return state.tasks.filter((task) => task.status === "waiting");
}

function activeTask() {
  if (!state.activeSession) return null;
  return state.tasks.find((task) => task.id === state.activeSession.taskId) || null;
}

function render() {
  renderStats();
  renderDeck();
  renderTaskList();
  renderFocus();
  renderWins();
}

function renderStats() {
  const doneToday = state.tasks.filter((task) => task.status === "done" && isToday(task.completedAt));
  const focusToday = state.sessions
    .filter((session) => isToday(session.endedAt))
    .reduce((sum, session) => sum + (session.durationSeconds || 0), 0);

  els.waitingCount.textContent = waitingTasks().length;
  els.doneTodayCount.textContent = doneToday.length;
  els.focusMinutesCount.textContent = `${Math.floor(focusToday / 60)}m`;
}

function cardHtml(task, stackIndex) {
  const accent = CATEGORY_COLORS[task.category] || "#8d5bff";
  const energyLabel = task.energy === "deep" ? "deep focus" : task.energy === "low" ? "low mind" : "medium energy";
  return `
    <article class="task-card" data-task-id="${escapeHtml(task.id)}" data-stack="${stackIndex}" style="--card-accent:${accent}">
      ${stackIndex === 0 ? '<span class="swipe-stamp match">locked</span><span class="swipe-stamp pass">later</span>' : ""}
      <div class="card-top">
        <span class="category-chip">${escapeHtml(task.category)}</span>
        <span class="energy-chip">${escapeHtml(energyLabel)}</span>
      </div>
      <h2>${escapeHtml(task.title)}</h2>
      <p class="card-note">${escapeHtml(task.notes || "Tiny move > dramatic master plan. Start messy.")}</p>
      <div class="card-meta">
        <span>◷ ${task.estimateMinutes} min</span>
        <span>${task.passCount ? `swiped past ${task.passCount}×` : "fresh side quest"}</span>
      </div>
    </article>`;
}

function renderDeck() {
  const queue = waitingTasks();
  if (!queue.length) {
    els.taskDeck.innerHTML = `
      <div class="deck-empty">
        <div>
          <span class="empty-icon">✦</span>
          <h2>Quest queue cleared. Huge W.</h2>
          <p>Drop a new side quest or return the current one to the deck. Your completed lore stays in the W archive.</p>
          <button class="primary-button" type="button" data-open-add>Drop a side quest</button>
        </div>
      </div>`;
    els.swipeActions.hidden = true;
    bindDynamicButtons();
    return;
  }

  els.swipeActions.hidden = false;
  els.taskDeck.innerHTML = queue.slice(0, 3).map(cardHtml).reverse().join("");
  const cards = [...els.taskDeck.querySelectorAll(".task-card")];
  cards.forEach((card) => {
    const originalStack = Number(card.dataset.stack);
    card.style.zIndex = String(10 - originalStack);
  });
  const topCard = els.taskDeck.querySelector('[data-stack="0"]');
  if (topCard) bindSwipeGesture(topCard);
}

function bindSwipeGesture(card) {
  let startX = 0;
  let currentX = 0;
  let dragging = false;

  const matchStamp = card.querySelector(".swipe-stamp.match");
  const passStamp = card.querySelector(".swipe-stamp.pass");

  card.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    startX = event.clientX;
    currentX = 0;
    card.classList.add("is-dragging");
    card.setPointerCapture(event.pointerId);
  });

  card.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    currentX = event.clientX - startX;
    const rotation = currentX / 18;
    card.style.transform = `translateX(${currentX}px) rotate(${rotation}deg)`;
    const strength = Math.min(Math.abs(currentX) / 100, 1);
    if (currentX > 0) {
      matchStamp.style.opacity = String(strength);
      passStamp.style.opacity = "0";
    } else {
      passStamp.style.opacity = String(strength);
      matchStamp.style.opacity = "0";
    }
  });

  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    card.classList.remove("is-dragging");
    try { card.releasePointerCapture(event.pointerId); } catch (_) {}
    if (Math.abs(currentX) >= 92) {
      animateSwipe(currentX > 0 ? "right" : "left");
      return;
    }
    card.style.transform = "";
    matchStamp.style.opacity = "0";
    passStamp.style.opacity = "0";
  };

  card.addEventListener("pointerup", endDrag);
  card.addEventListener("pointercancel", endDrag);
}

function animateSwipe(direction) {
  const task = waitingTasks()[0];
  if (!task) return;
  const topCard = els.taskDeck.querySelector('[data-stack="0"]');
  if (topCard) topCard.classList.add(direction === "right" ? "is-leaving-right" : "is-leaving-left");
  window.setTimeout(() => {
    if (direction === "right") startTask(task.id, "swipe");
    else passTask(task.id);
  }, 190);
}

function passTask(id) {
  const index = state.tasks.findIndex((task) => task.id === id);
  if (index < 0) return;
  const [task] = state.tasks.splice(index, 1);
  task.passCount = (task.passCount || 0) + 1;
  task.updatedAt = nowIso();
  state.tasks.push(task);
  saveState();
  render();
  showToast("Not the vibe rn — sent to the back ✦");
}

function startTask(id, source = "list") {
  if (state.activeSession) {
    const current = activeTask();
    if (current?.id === id) {
      setView("focus");
      return;
    }
    showToast(`Finish or return “${current?.title || "your current quest"}” first`);
    setView("focus");
    return;
  }

  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const timestamp = Date.now();
  task.status = "active";
  task.startedAt = new Date(timestamp).toISOString();
  task.updatedAt = task.startedAt;
  state.activeSession = {
    id: makeId("session"),
    taskId: task.id,
    source,
    targetSeconds: task.estimateMinutes * 60,
    startedAtMs: timestamp,
    accumulatedSeconds: 0,
    paused: false,
  };
  saveState();
  render();
  setView("focus");
  showToast("Quest matched. Lock-in era activated ⚡");
}

function elapsedSeconds() {
  const session = state.activeSession;
  if (!session) return 0;
  if (session.paused) return session.accumulatedSeconds || 0;
  return (session.accumulatedSeconds || 0) + Math.max(0, (Date.now() - session.startedAtMs) / 1000);
}

function togglePause() {
  const session = state.activeSession;
  if (!session) return;
  if (session.paused) {
    session.startedAtMs = Date.now();
    session.paused = false;
  } else {
    session.accumulatedSeconds = elapsedSeconds();
    session.paused = true;
  }
  saveState();
  renderFocus();
}

function logSession(task, outcome, durationSeconds) {
  state.sessions.unshift({
    id: state.activeSession?.id || makeId("session"),
    taskId: task.id,
    taskTitle: task.title,
    category: task.category,
    startedAt: task.startedAt || nowIso(),
    endedAt: nowIso(),
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    outcome,
    source: state.activeSession?.source || "list",
  });
}

function finishTask(id, source = "list") {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  const wasActive = state.activeSession?.taskId === id;
  const duration = wasActive ? elapsedSeconds() : 0;
  if (!wasActive) {
    state.activeSession = { id: makeId("session"), source, taskId: id };
  }
  logSession(task, "completed", duration);
  task.status = "done";
  task.completedAt = nowIso();
  task.updatedAt = task.completedAt;
  state.activeSession = null;
  saveState();
  render();
  setView("wins");
  showToast("Massive W. Logged forever ✦");
}

function returnActiveToWaiting() {
  const task = activeTask();
  if (!task) return;
  const duration = elapsedSeconds();
  if (duration >= 5) logSession(task, "partial", duration);
  task.status = "waiting";
  task.startedAt = null;
  task.updatedAt = nowIso();
  state.activeSession = null;
  saveState();
  render();
  setView("swipe");
  showToast(duration >= 5 ? "Lock-in logged; quest returned to the deck" : "Quest returned to the deck");
}

function keepGoing() {
  const session = state.activeSession;
  if (!session) return;
  const elapsed = elapsedSeconds();
  session.targetSeconds = Math.ceil(elapsed / 900) * 900 + 900;
  saveState();
  renderFocus();
  showToast("Keep going — added breathing room");
}

function renderFocus() {
  window.clearInterval(timerInterval);
  const task = activeTask();
  const session = state.activeSession;
  if (!task || !session) {
    els.focusContent.innerHTML = `
      <div class="focus-empty">
        <div>
          <span class="empty-icon">◉</span>
          <h2>No quest locked in yet.</h2>
          <p>Swipe right on one side quest. The rest of the brain-dump lore can wait its turn.</p>
          <button class="primary-button" type="button" data-view-go="swipe">Find my next quest</button>
        </div>
      </div>`;
    bindDynamicButtons();
    return;
  }

  const accent = CATEGORY_COLORS[task.category] || "#8d5bff";
  els.focusContent.innerHTML = `
    <article class="focus-panel" style="--card-accent:${accent}">
      <span class="category-chip" style="--card-accent:${accent}">${escapeHtml(task.category)}</span>
      <h1>${escapeHtml(task.title)}</h1>
      <p>${escapeHtml(task.notes || "Stay with the next visible move. You are not required to fix your entire lore in one sitting.")}</p>
      <div class="timer-ring" id="timerRing">
        <div class="timer-display">
          <strong id="timerValue">00:00</strong>
          <small id="timerLabel">of ${task.estimateMinutes} minutes</small>
        </div>
      </div>
      <p class="time-up" id="timeUpMessage" hidden>Your planned block is complete. What happened?</p>
      <div class="focus-actions">
        <button class="secondary-button" id="pauseTimer" type="button">${session.paused ? "Resume" : "Pause"}</button>
        <button class="primary-button" id="finishActive" type="button">Claim the W</button>
        <button class="secondary-button" id="keepGoing" type="button" hidden>Keep going</button>
        <button class="danger-button" id="returnTask" type="button">Log & send back</button>
      </div>
    </article>`;

  document.querySelector("#pauseTimer").addEventListener("click", togglePause);
  document.querySelector("#finishActive").addEventListener("click", () => finishTask(task.id, session.source));
  document.querySelector("#returnTask").addEventListener("click", returnActiveToWaiting);
  document.querySelector("#keepGoing").addEventListener("click", keepGoing);
  updateTimerDisplay();
  timerInterval = window.setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
  const session = state.activeSession;
  const timerValue = document.querySelector("#timerValue");
  const timerRing = document.querySelector("#timerRing");
  if (!session || !timerValue || !timerRing) return;
  const elapsed = elapsedSeconds();
  const remaining = Math.max(0, session.targetSeconds - elapsed);
  const minutes = Math.floor(remaining / 60).toString().padStart(2, "0");
  const seconds = Math.floor(remaining % 60).toString().padStart(2, "0");
  timerValue.textContent = `${minutes}:${seconds}`;
  const progress = Math.min(100, (elapsed / session.targetSeconds) * 100);
  timerRing.style.setProperty("--progress", `${progress}%`);
  const isUp = remaining <= 0;
  const timeUpMessage = document.querySelector("#timeUpMessage");
  const keepGoingButton = document.querySelector("#keepGoing");
  if (timeUpMessage) timeUpMessage.hidden = !isUp;
  if (keepGoingButton) keepGoingButton.hidden = !isUp;
}

function renderTaskList() {
  const query = els.taskSearch.value.trim().toLowerCase();
  const tasks = state.tasks.filter((task) => {
    const statusMatches = listFilter === "active" ? task.status === "active" : task.status === listFilter;
    const textMatches = !query || `${task.title} ${task.notes} ${task.category}`.toLowerCase().includes(query);
    return statusMatches && textMatches;
  });

  if (!tasks.length) {
    els.taskList.innerHTML = `
      <div class="list-empty">
        <div>
          <span class="empty-icon">⌕</span>
          <h2>No quest lore here.</h2>
          <p>${query ? "Different search, bestie?" : `No ${listFilter} quests. The queue is allowed to breathe.`}</p>
        </div>
      </div>`;
    return;
  }

  els.taskList.innerHTML = tasks.map((task) => {
    const accent = CATEGORY_COLORS[task.category] || "#8d5bff";
    return `
      <article class="task-item" style="--card-accent:${accent}">
        <div class="task-item-top">
          <span class="category-chip">${escapeHtml(task.category)}</span>
          <span class="energy-chip">${task.estimateMinutes} min · ${escapeHtml(task.energy)}</span>
        </div>
        <h3>${escapeHtml(task.title)}</h3>
        ${task.notes ? `<p>${escapeHtml(task.notes)}</p>` : ""}
        <div class="task-item-actions">
          ${task.status === "waiting" ? `<button class="mini-button accent" type="button" data-start-task="${escapeHtml(task.id)}">Start</button>` : ""}
          ${task.status === "active" ? `<button class="mini-button accent" type="button" data-view-go="focus">Open focus</button>` : ""}
          ${task.status !== "done" ? `<button class="mini-button" type="button" data-finish-task="${escapeHtml(task.id)}">Done</button>` : ""}
          ${task.status !== "active" ? `<button class="mini-button" type="button" data-edit-task="${escapeHtml(task.id)}">Edit</button>` : ""}
          ${task.status === "done" ? `<button class="mini-button" type="button" data-reopen-task="${escapeHtml(task.id)}">Reopen</button>` : ""}
        </div>
      </article>`;
  }).join("");
  bindDynamicButtons();
}

function renderWins() {
  const sessions = [...state.sessions].sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt));
  if (!sessions.length) {
    els.winsList.innerHTML = `
      <div class="list-empty">
        <div>
          <span class="empty-icon">✦</span>
          <h2>Your first W is loading.</h2>
          <p>Finished quests and partial lock-ins will leave receipts here.</p>
        </div>
      </div>`;
    return;
  }

  els.winsList.innerHTML = sessions.map((session) => `
    <article class="win-item">
      <span class="win-icon">${session.outcome === "completed" ? "✓" : "◷"}</span>
      <div>
        <div class="session-meta">
          <span class="source-chip">${session.source === "swipe" ? "swipe match" : "quest list"}</span>
          <span class="source-chip">${escapeHtml(session.outcome)}</span>
        </div>
        <h3>${escapeHtml(session.taskTitle)}</h3>
        <p>${formatDateTime(session.endedAt)} · ${escapeHtml(session.category || "Task")}</p>
      </div>
      <strong class="win-duration">${formatDuration(session.durationSeconds)}</strong>
    </article>`).join("");
}

function openTaskDialog(task = null) {
  els.taskForm.reset();
  els.taskId.value = task?.id || "";
  els.taskDialogTitle.textContent = task ? "Edit side quest" : "Drop a side quest";
  els.taskTitle.value = task?.title || "";
  els.taskCategory.value = task?.category || "👑 Empire Building";
  els.taskEstimate.value = String(task?.estimateMinutes || 60);
  els.taskEnergy.value = task?.energy || "medium";
  els.taskNotes.value = task?.notes || "";
  els.taskDialog.showModal();
  window.setTimeout(() => els.taskTitle.focus(), 40);
}

function saveTaskFromForm(event) {
  event.preventDefault();
  const id = els.taskId.value;
  const input = {
    title: els.taskTitle.value,
    category: els.taskCategory.value,
    estimateMinutes: Number(els.taskEstimate.value),
    energy: els.taskEnergy.value,
    notes: els.taskNotes.value,
  };
  if (!input.title.trim()) return;

  if (id) {
    const task = state.tasks.find((item) => item.id === id);
    if (task) Object.assign(task, input, { title: input.title.trim(), notes: input.notes.trim(), updatedAt: nowIso() });
    showToast("Quest glow-up saved");
  } else {
    state.tasks.unshift(createTask(input));
    showToast("Side quest dropped into the deck ✦");
  }
  saveState();
  els.taskDialog.close();
  render();
}

function reopenTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.status = "waiting";
  task.completedAt = null;
  task.startedAt = null;
  task.updatedAt = nowIso();
  const index = state.tasks.indexOf(task);
  state.tasks.splice(index, 1);
  state.tasks.unshift(task);
  saveState();
  render();
  showToast("Quest revived and returned to the deck");
}

function shuffleDeck() {
  const waiting = state.tasks.filter((task) => task.status === "waiting");
  for (let index = waiting.length - 1; index > 0; index -= 1) {
    const random = Math.floor(Math.random() * (index + 1));
    [waiting[index], waiting[random]] = [waiting[random], waiting[index]];
  }
  const others = state.tasks.filter((task) => task.status !== "waiting");
  state.tasks = [...waiting, ...others];
  saveState();
  renderDeck();
  showToast("Plot reshuffled — fate has opinions");
}

function stripWhatsAppMarks(value = "") {
  return String(value)
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[\u00a0\u202f]/g, " ")
    .trim();
}

function parseWhatsAppExport(rawText) {
  const lines = String(rawText).replace(/\r\n?/g, "\n").split("\n");
  const authoredAndroid = /^(\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}),\s+(.+?)\s+[-–—]\s+([^:\n]{1,120}):(?:\s|$)(.*)$/u;
  const anyAndroidBoundary = /^\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4},\s+.+?\s+[-–—]\s+/u;
  const authoredBracketed = /^\[(\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4},\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]\.?M\.?)?)\]\s*([^:\n]{1,120}):(?:\s|$)(.*)$/iu;
  const anyBracketedBoundary = /^\[\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4},\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]\.?M\.?)?\]\s*/iu;
  const messages = [];
  let systemMessages = 0;
  let current = null;

  function commitCurrent() {
    if (!current) return;
    current.text = stripWhatsAppMarks(current.text);
    messages.push(current);
    current = null;
  }

  lines.forEach((rawLine) => {
    const line = stripWhatsAppMarks(rawLine);
    const androidMatch = line.match(authoredAndroid);
    const bracketedMatch = line.match(authoredBracketed);

    if (androidMatch) {
      commitCurrent();
      current = {
        dateLabel: androidMatch[1] + ", " + androidMatch[2],
        sender: androidMatch[3].trim(),
        text: androidMatch[4],
      };
      return;
    }

    if (bracketedMatch) {
      commitCurrent();
      current = {
        dateLabel: bracketedMatch[1],
        sender: bracketedMatch[2].trim(),
        text: bracketedMatch[3],
      };
      return;
    }

    if (anyAndroidBoundary.test(line) || anyBracketedBoundary.test(line)) {
      commitCurrent();
      systemMessages += 1;
      return;
    }

    if (current && line) current.text += "\n" + line;
  });

  commitCurrent();
  return { messages, systemMessages };
}

function sanitizeWhatsAppMessage(value) {
  return stripWhatsAppMarks(value)
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[•\-–—]\s*/, "")
    .trim();
}

function splitWhatsAppChecklist(value) {
  const lines = stripWhatsAppMarks(value).split("\n").map((line) => line.trim()).filter(Boolean);
  const checklistLines = lines.filter((line) => /^(?:[-•*]|☐|✅|\d+[.)])\s+/.test(line));
  if (checklistLines.length < 2) return [value];
  return checklistLines.map((line) => line.replace(/^(?:[-•*]|☐|✅|\d+[.)])\s+/, "").trim());
}

function looksLikeSensitiveMessage(value) {
  return /(?:password|passwd|api\s*key|access\s*key|secret\s*key|private\s*key|auth(?:orization)?\s*token|bearer\s+[a-z0-9._=-]+|\botp\b|\bcvv\b|\bpin\s*[:=-]\s*\d+|\baccount\s*(?:number|no)\b|\baadhaar\b|\bpan\s*(?:number|no)?\b)/i.test(value)
    || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)
    || /\b\d{10,}\b/.test(value)
    || /\bocid1\.[a-z0-9._-]{20,}\b/i.test(value)
    || /\b[A-Za-z0-9_=-]{36,}\b/.test(value);
}

function looksLikeWhatsAppJunk(value) {
  return !value
    || /^(?:<media omitted>|image omitted|video omitted|audio omitted|sticker omitted|document omitted|gif omitted)$/i.test(value)
    || /^(?:this message was deleted|you deleted this message|null)$/i.test(value)
    || /^(?:missed )?(?:voice|video) call$/i.test(value);
}

function scoreWhatsAppTask(value) {
  const text = value.toLowerCase();
  let score = 0;
  const planningCue = /\b(?:need to|have to|got to|should|must|todo|to-do|task|remind me|plan to|planning to|i(?:'ll| will)|let us|let's)\b/;
  const actionVerb = /\b(?:finish|complete|start|do|make|create|build|fix|update|send|ask|call|book|buy|order|apply|submit|check|review|read|study|learn|practice|solve|attempt|write|draft|watch|research|plan|prepare|clean|wash|bathe|exercise|workout|walk|gym|drive|pay|message|reply|upload|download|schedule|attend|go)\b/;
  const actionStart = /^(?:please\s+|pls\s+|bro+\s+|yaar\s+)*(?:finish|complete|start|do|make|create|build|fix|update|send|ask|call|book|buy|order|apply|submit|check|review|read|study|learn|practice|solve|attempt|write|draft|watch|research|plan|prepare|clean|wash|bathe|exercise|workout|walk|gym|drive|pay|message|reply|upload|download|schedule|attend|go)\b/;
  const transliteratedCue = /\b(?:cheyali|cheyyali|cheyyaali|chudali|choovali|nerchukovali|vellali|veltali|povali|avvali|kavali|chesey|cheyyi|chudu)\b/;

  if (planningCue.test(text)) score += 4;
  if (actionStart.test(text)) score += 3;
  if (actionVerb.test(text)) score += 2;
  if (transliteratedCue.test(text)) score += 4;
  if (/\b(?:gym|workout|course|class|ticket|question|runbook|pr)\b.*\b(?:check|learn|do|go|watch|finish|complete)\b/.test(text)) score += 2;
  if (/^\d+[\s.)-]+/.test(text) || /(?:^|\s)[☐✅]\s*/.test(text)) score += 2;
  if (text.split(/\s+/).length <= 24) score += 1;

  if (/^(?:can|could|would|will)\s+(?:u|you)\b/.test(text)) score -= 3;
  if (/\b(?:boyfriend|breakup|relationship|he is|he was|he will|i feel|i hate|i am sad|i am scared|i am anxious|i am alone|crying|cried|pain|begging|love me|be happy|be strong)\b/.test(text)) score -= 5;
  if (text.endsWith("?") && !/^(?:find|check|research|learn)\b/.test(text)) score -= 2;
  if (text.split(/\s+/).length > 70) score -= 2;
  return score;
}

function inferImportedCategory(value) {
  const text = value.toLowerCase();
  if (/\b(?:work|office|ticket|manager|runbook|bug|pr|pull request|reviewer|review comment|work item)\b/.test(text)) return "🛸 Office Grind";
  if (/\b(?:cp|dsa|leetcode|codeforces|system design|interview|resume|switch|hackathon|study|course|learn|question|algorithm)\b/.test(text)) return "👑 Empire Building";
  if (/\b(?:gym|walk|workout|exercise|skin|hair|bath|shower|food|meal|diet|sleep|doctor|medicine|health|yoga)\b/.test(text)) return "💪 Glow Up";
  if (/\b(?:driving|licen[cs]e|dl class|scooty|car|bank|bill|laundry|wash clothes|clean room|adulting)\b/.test(text)) return "🛵 Freedom & Adulting";
  if (/\b(?:reel|content|post|twitter|instagram|video|edit|creator|newsletter|blog|design)\b/.test(text)) return "🎨 Creator Mode";
  if (/\b(?:trip|travel|trek|event|friend|meet|date|restaurant|concert|explore)\b/.test(text)) return "🌍 Explore & Social";
  if (/\b(?:krishna|gita|god|prayer|pray|meditat|temple|faith)\b/.test(text)) return "🕉 Faith & Regulation";
  return "👑 Empire Building";
}

function inferImportedEstimate(value) {
  const explicit = value.match(/\b(15|30|45|60|90)\s*(?:m|min|mins|minute|minutes)\b/i);
  if (explicit) return Number(explicit[1]);
  if (/\b(?:call|message|reply|order|buy|book|pay|send|ask)\b/i.test(value)) return 15;
  if (/\b(?:cp|dsa|leetcode|codeforces|study|course|system design|ticket|runbook|deep)\b/i.test(value)) return 60;
  return 30;
}

function inferImportedEnergy(value) {
  if (/\b(?:cp|dsa|leetcode|codeforces|study|learn|course|system design|ticket|runbook|write|build|fix)\b/i.test(value)) return "deep";
  if (/\b(?:walk|bath|shower|wash|order|buy|book|call|message|reply)\b/i.test(value)) return "low";
  return "medium";
}

function importedTaskTitle(value) {
  if (value.length <= 140) return value;
  const shortened = value.slice(0, 137);
  const lastSpace = shortened.lastIndexOf(" ");
  return (lastSpace > 90 ? shortened.slice(0, lastSpace) : shortened) + "…";
}

function comparableTaskText(value) {
  return String(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

async function fingerprintWhatsAppText(value) {
  if (!crypto.subtle || !window.TextEncoder) return "local-" + value.length;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function visibleWhatsAppCandidates() {
  const query = els.whatsappSearch.value.trim().toLowerCase();
  const showAll = els.whatsappShowAll.checked;
  return whatsappCandidates.filter((candidate) => {
    const confidenceMatches = showAll || candidate.suggested;
    const queryMatches = !query || candidate.text.toLowerCase().includes(query)
      || candidate.category.toLowerCase().includes(query);
    return confidenceMatches && queryMatches;
  });
}

function renderWhatsAppCandidates() {
  const visible = visibleWhatsAppCandidates();
  const rendered = visible.slice(0, whatsappRenderCount);
  const selectedCount = whatsappCandidates.filter((candidate) => candidate.selected).length;
  els.whatsappVisibleCount.textContent = visible.length > whatsappRenderCount
    ? "Showing " + whatsappRenderCount + " of " + visible.length
    : visible.length + " shown";
  els.whatsappSelectedCount.textContent = selectedCount + " selected";
  els.importSelectedWhatsApp.disabled = selectedCount === 0;
  els.importSelectedWhatsApp.textContent = selectedCount ? "Import selected (" + selectedCount + ")" : "Import selected";

  if (!rendered.length) {
    els.whatsappCandidateList.innerHTML = '<div class="candidate-empty">No messages match this view. Try “Show all reviewable messages” or a different search.</div>';
    return;
  }

  els.whatsappCandidateList.innerHTML = rendered.map((candidate) => (
    '<label class="candidate-item">'
      + '<input type="checkbox" data-whatsapp-candidate="' + candidate.id + '"' + (candidate.selected ? " checked" : "") + ' />'
      + '<span class="candidate-copy">'
        + '<strong>' + escapeHtml(candidate.text) + '</strong>'
        + '<small>' + escapeHtml(candidate.dateLabel) + (candidate.suggested ? " · suggested task" : " · needs your review") + '</small>'
      + '</span>'
      + '<span class="candidate-category">' + escapeHtml(candidate.category) + ' · ' + candidate.estimateMinutes + 'm</span>'
    + '</label>'
  )).join("") + (visible.length > rendered.length
    ? '<button class="secondary-button load-more-import" id="loadMoreWhatsApp" type="button">Show ' + Math.min(WHATSAPP_RENDER_LIMIT, visible.length - rendered.length) + ' more</button>'
    : "");

  document.querySelectorAll("[data-whatsapp-candidate]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const candidate = whatsappCandidates.find((item) => item.id === checkbox.dataset.whatsappCandidate);
      if (candidate) candidate.selected = checkbox.checked;
      renderWhatsAppCandidates();
    });
  });
  document.querySelector("#loadMoreWhatsApp")?.addEventListener("click", () => {
    whatsappRenderCount += WHATSAPP_RENDER_LIMIT;
    renderWhatsAppCandidates();
  });
}

function openWhatsAppImport() {
  if (!els.whatsappDialog.open) els.whatsappDialog.showModal();
  els.whatsappFileStep.hidden = whatsappCandidates.length > 0;
  els.whatsappPreview.hidden = whatsappCandidates.length === 0;
}

async function loadWhatsAppFile(file) {
  if (!file) return;
  if (file.size > WHATSAPP_MAX_FILE_BYTES) {
    showToast("That chat is over 10 MB — export without media and try again");
    els.whatsappFile.value = "";
    return;
  }

  try {
    const rawText = await file.text();
    const parsed = parseWhatsAppExport(rawText);
    const fingerprint = await fingerprintWhatsAppText(rawText);
    const seen = new Set();
    let skippedPrivate = 0;
    let skippedJunk = 0;

    whatsappCandidates = parsed.messages.flatMap((message, index) => (
      splitWhatsAppChecklist(message.text).flatMap((segment, segmentIndex) => {
        const text = sanitizeWhatsAppMessage(segment);
        if (looksLikeWhatsAppJunk(text)) {
          skippedJunk += 1;
          return [];
        }
        if (looksLikeSensitiveMessage(text)) {
          skippedPrivate += 1;
          return [];
        }
        const comparable = comparableTaskText(text);
        if (!comparable || seen.has(comparable)) {
          skippedJunk += 1;
          return [];
        }
        seen.add(comparable);
        const score = scoreWhatsAppTask(text);
        return [{
          id: "wa-" + index + "-" + segmentIndex,
          fingerprint: fingerprint + "-" + index + "-" + segmentIndex,
          text,
          dateLabel: message.dateLabel,
          suggested: score >= 7,
          selected: score >= 7,
          category: inferImportedCategory(text),
          estimateMinutes: inferImportedEstimate(text),
          energy: inferImportedEnergy(text),
        }];
      })
    ));

    const suggestedCount = whatsappCandidates.filter((candidate) => candidate.suggested).length;
    const alreadyImported = state.imports.some((item) => item.fingerprint === fingerprint);
    whatsappImportStats = {
      fingerprint,
      authoredMessages: parsed.messages.length,
      systemMessages: parsed.systemMessages,
      suggestedCount,
      skippedPrivate,
      skippedJunk,
      firstDate: parsed.messages[0]?.dateLabel || "",
      lastDate: parsed.messages.at(-1)?.dateLabel || "",
      alreadyImported,
    };

    els.whatsappFileName.textContent = file.name;
    els.whatsappSummary.textContent = parsed.messages.length + " messages scanned · "
      + suggestedCount + " task-like suggestions · "
      + skippedPrivate + " sensitive-looking entries skipped"
      + (alreadyImported ? " · this file was imported before" : "");
    els.whatsappSearch.value = "";
    els.whatsappShowAll.checked = false;
    whatsappRenderCount = WHATSAPP_RENDER_LIMIT;
    els.whatsappFileStep.hidden = true;
    els.whatsappPreview.hidden = false;
    renderWhatsAppCandidates();
  } catch (error) {
    console.error(error);
    showToast("I could not read that WhatsApp export");
  } finally {
    els.whatsappFile.value = "";
  }
}

function selectSuggestedWhatsAppTasks() {
  whatsappCandidates.forEach((candidate) => {
    candidate.selected = candidate.suggested;
  });
  renderWhatsAppCandidates();
}

function clearWhatsAppSelection() {
  whatsappCandidates.forEach((candidate) => {
    candidate.selected = false;
  });
  renderWhatsAppCandidates();
}

function resetWhatsAppImport() {
  whatsappCandidates = [];
  whatsappImportStats = null;
  whatsappRenderCount = WHATSAPP_RENDER_LIMIT;
  els.whatsappSearch.value = "";
  els.whatsappShowAll.checked = false;
  els.whatsappFileStep.hidden = false;
  els.whatsappPreview.hidden = true;
  els.whatsappFile.click();
}

function importSelectedWhatsAppTasks() {
  const selected = whatsappCandidates.filter((candidate) => candidate.selected);
  if (!selected.length) return;
  const existingTitles = new Set(state.tasks.map((task) => comparableTaskText(task.title)));
  const existingFingerprints = new Set(state.tasks.map((task) => task.importSource?.fingerprint).filter(Boolean));
  const imported = [];
  let duplicates = 0;

  selected.forEach((candidate) => {
    const title = importedTaskTitle(candidate.text);
    const comparable = comparableTaskText(title);
    if (existingTitles.has(comparable) || existingFingerprints.has(candidate.fingerprint)) {
      duplicates += 1;
      return;
    }
    existingTitles.add(comparable);
    existingFingerprints.add(candidate.fingerprint);
    const sourceNote = "Imported from WhatsApp · " + candidate.dateLabel;
    const overflow = candidate.text.length > title.length ? candidate.text : "";
    const notes = (overflow ? overflow + "\n\n" : "") + sourceNote;
    const task = createTask({
      title,
      notes: notes.slice(0, 500),
      category: candidate.category,
      estimateMinutes: candidate.estimateMinutes,
      energy: candidate.energy,
    });
    task.importSource = {
      type: "whatsapp",
      fingerprint: candidate.fingerprint,
    };
    imported.push(task);
  });

  state.tasks.unshift(...imported);
  if (whatsappImportStats && imported.length) {
    state.imports.push({
      id: makeId("import"),
      type: "whatsapp",
      fingerprint: whatsappImportStats.fingerprint,
      importedAt: nowIso(),
      taskCount: imported.length,
    });
  }
  saveState();
  render();
  els.whatsappDialog.close();
  setView("tasks");
  showToast(imported.length + " tasks rescued" + (duplicates ? " · " + duplicates + " duplicates skipped" : "") + " ✦");
}

function exportData() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `swipequest-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Backup exported");
}

async function importData(file) {
  if (!file) return;
  if (file.size > BACKUP_MAX_FILE_BYTES) {
    showToast("That backup is over 5 MB and was not opened");
    els.importFile.value = "";
    return;
  }
  try {
    const parsed = JSON.parse(await file.text());
    const normalized = normalizeStoredState(parsed);
    if (!normalized) {
      throw new Error("Invalid SwipeQuest backup");
    }
    state = normalized;
    saveState();
    render();
    showToast("Backup restored successfully");
  } catch (error) {
    console.error(error);
    showToast("That file is not a valid SwipeQuest backup");
  } finally {
    els.importFile.value = "";
  }
}

function bindDynamicButtons() {
  document.querySelectorAll("[data-open-add]").forEach((button) => {
    button.addEventListener("click", () => openTaskDialog());
  });
  document.querySelectorAll("[data-view-go]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewGo));
  });
  document.querySelectorAll("[data-start-task]").forEach((button) => {
    button.addEventListener("click", () => startTask(button.dataset.startTask, "list"));
  });
  document.querySelectorAll("[data-finish-task]").forEach((button) => {
    button.addEventListener("click", () => finishTask(button.dataset.finishTask, "list"));
  });
  document.querySelectorAll("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = state.tasks.find((item) => item.id === button.dataset.editTask);
      if (task) openTaskDialog(task);
    });
  });
  document.querySelectorAll("[data-reopen-task]").forEach((button) => {
    button.addEventListener("click", () => reopenTask(button.dataset.reopenTask));
  });
}

document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.viewTarget));
});

document.querySelector("#openAddTask").addEventListener("click", () => openTaskDialog());
els.themeToggle.addEventListener("click", toggleTheme);
document.querySelector("#openAddTaskFromList").addEventListener("click", () => openTaskDialog());
document.querySelector("#passTask").addEventListener("click", () => animateSwipe("left"));
document.querySelector("#matchTask").addEventListener("click", () => animateSwipe("right"));
document.querySelector("#shuffleDeck").addEventListener("click", shuffleDeck);
document.querySelector("#exportData").addEventListener("click", exportData);
document.querySelector("#importData").addEventListener("click", () => els.importFile.click());
document.querySelector("#openWhatsAppImport").addEventListener("click", openWhatsAppImport);
document.querySelector("#chooseDifferentWhatsAppFile").addEventListener("click", resetWhatsAppImport);
document.querySelector("#selectSuggested").addEventListener("click", selectSuggestedWhatsAppTasks);
document.querySelector("#clearWhatsAppSelection").addEventListener("click", clearWhatsAppSelection);
els.importSelectedWhatsApp.addEventListener("click", importSelectedWhatsAppTasks);
els.importFile.addEventListener("change", () => importData(els.importFile.files[0]));
els.whatsappFile.addEventListener("change", () => loadWhatsAppFile(els.whatsappFile.files[0]));
els.whatsappSearch.addEventListener("input", () => {
  whatsappRenderCount = WHATSAPP_RENDER_LIMIT;
  renderWhatsAppCandidates();
});
els.whatsappShowAll.addEventListener("change", () => {
  whatsappRenderCount = WHATSAPP_RENDER_LIMIT;
  renderWhatsAppCandidates();
});
els.taskForm.addEventListener("submit", saveTaskFromForm);
els.taskSearch.addEventListener("input", renderTaskList);

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeDialog}`).close());
});

document.querySelectorAll("[data-status-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    listFilter = button.dataset.statusFilter;
    document.querySelectorAll("[data-status-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
    renderTaskList();
  });
});

document.addEventListener("keydown", (event) => {
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if (typing || els.taskDialog.open || els.whatsappDialog.open || activeView !== "swipe") return;
  if (event.key === "ArrowLeft") animateSwipe("left");
  if (event.key === "ArrowRight") animateSwipe("right");
});

window.addEventListener("storage", (event) => {
  if (event.key === THEME_STORAGE_KEY) {
    applyTheme(event.newValue || "cherry-editorial", false);
    return;
  }
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    state = JSON.parse(event.newValue);
    render();
  } catch (_) {}
});

applyTheme(currentTheme(), false);
render();
