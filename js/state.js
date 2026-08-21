// js/state.js
// État partagé de l'application et utilitaires généraux

export const state = {
  currentUser: null,
  currentUserProfile: null,
  activeStudentUid: null,
  activeStudentProfile: null,
  isReadOnly: false,
  selectedRegRole: "student",
  activeDataListeners: [],
  allUsersCache: [],
  days: ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"],
  months: ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"],
  layout: localStorage.getItem("app_layout_final") || (window.innerWidth < 768 ? "mobile" : "pc"),
  currentMonday: getMon(new Date()),
  curDayIdx: (new Date().getDay() + 6) % 7,
  db: [],
  examsDb: [],
  userGrades: {},
  bacArchiveData: {},
  sessionDateTodos: {},
  currentTrimester: "trim1",
  currentBacSubjectId: "math",
};

export function getStudentPath(subPath = "") {
  const uid = state.activeStudentUid || (state.currentUser && state.currentUser.uid) || "guest_demo";
  const cleanSub = (subPath || "").replace(/^\/+/, "");
  return cleanSub ? `student_data/${uid}/${cleanSub}` : `student_data/${uid}`;
}

export function getMon(d) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(dt.setDate(diff));
}

export function formatM(m) {
  let h = Math.floor(m / 60),
    min = m % 60;
  return `${h < 10 ? "0" + h : h}:${min < 10 ? "0" + min : min}`;
}

let loadingTimeout = null;

export function showLoading(msg) {
  const textEl = document.getElementById("loadingText");
  const overlayEl = document.getElementById("loadingOverlay");
  if (textEl) textEl.innerText = msg;
  if (overlayEl) overlayEl.style.display = "flex";

  if (loadingTimeout) clearTimeout(loadingTimeout);
  // Auto-timeout de sécurité : ferme automatiquement le chargement après 15 secondes max
  loadingTimeout = setTimeout(() => {
    hideLoading();
  }, 15000);
}

export function hideLoading() {
  if (loadingTimeout) {
    clearTimeout(loadingTimeout);
    loadingTimeout = null;
  }
  const overlayEl = document.getElementById("loadingOverlay");
  if (overlayEl) overlayEl.style.display = "none";
}

export function playBeep() {
  // Tous les sons et bips sont désactivés dans l'application
}

export function getSubjectMeta(sub = "") {
  const s = (sub || "").toLowerCase();
  if (s.includes("math")) return { cls: "ev-math", ico: "📐", name: "Mathématiques", coef: 4 };
  if (s.includes("phys") || s.includes("chim")) return { cls: "ev-phys", ico: "🔬", name: "Sciences Physiques", coef: 4 };
  if (s.includes("svt") || s.includes("scie") || s.includes("3ouloum")) return { cls: "ev-svt", ico: "🧬", name: "Sciences SVT", coef: 4 };
  if (s.includes("info") || s.includes("tic") || s.includes("algo")) return { cls: "ev-info", ico: "💻", name: "Informatique", coef: 3 };
  if (s.includes("philo") || s.includes("falsafa")) return { cls: "ev-philo", ico: "🧠", name: "Philosophie", coef: 1 };
  if (s.includes("arab") || s.includes("3arbi")) return { cls: "ev-arabe", ico: "📖", name: "Arabe", coef: 1 };
  if (s.includes("fran") || s.includes("french")) return { cls: "ev-francais", ico: "🇫🇷", name: "Français", coef: 1 };
  if (s.includes("angl") || s.includes("eng")) return { cls: "ev-anglais", ico: "🇬🇧", name: "Anglais", coef: 1 };
  if (s.includes("sport") || s.includes("eps")) return { cls: "ev-sport", ico: "🏃", name: "Sport", coef: 1 };
  return { cls: "ev-option", ico: "📌", name: sub || "Autre", coef: 1 };
}

export function getEventStatus(eventDay, startMins, endMins) {
  const now = new Date();
  const currentWeekMon = getMon(now);
  const isCurrentWeek = state.currentMonday.getDate() === currentWeekMon.getDate() && state.currentMonday.getMonth() === currentWeekMon.getMonth();
  const realDayIdx = (now.getDay() + 6) % 7;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (!isCurrentWeek) return { class: "", text: "" };
  if (eventDay < realDayIdx) return { class: "passed", text: '<span class="status-badge badge-passed">✓ FAIT</span>' };
  if (eventDay === realDayIdx) {
    if (currentMinutes >= endMins) return { class: "passed", text: '<span class="status-badge badge-passed">✓ FAIT</span>' };
    if (currentMinutes >= startMins && currentMinutes < endMins) return { class: "in-progress", text: '<span class="status-badge badge-progress">⚡ EN COURS</span>' };
    return { class: "upcoming", text: '<span class="status-badge badge-upcoming">🕒 À VENIR</span>' };
  }
  return { class: "upcoming", text: '<span class="status-badge badge-upcoming">🕒 À VENIR</span>' };
}

// Global UI Window Bindings
window.showLoading = showLoading;
window.hideLoading = hideLoading;

window.openOverlay = function (id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "flex";

  if (id === "bacArchiveOverlay") {
    if (window.initBacArchiveTabs) window.initBacArchiveTabs();
  } else if (id === "gradesOverlay") {
    if (window.switchTrimester) window.switchTrimester(state.currentTrimester || "trim1");
  } else if (id === "examsOverlay") {
    if (window.renderExams) window.renderExams();
  } else if (id === "statsOverlay") {
    if (window.renderStatsData) window.renderStatsData();
  } else if (id === "timerOverlay") {
    if (window.renderTimer) window.renderTimer();
  } else if (id === "adminOverlay") {
    if (window.loadAdminKPIs) window.loadAdminKPIs();
  }
};

window.closeOverlay = function (id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
};

window.openModal = function (id, day = state.curDayIdx, h = 8) {
  if (state.isReadOnly && (id === "addModal" || id === "addExamModal")) return;
  if (id === "addModal") {
    const mDay = document.getElementById("mDay");
    const mStart = document.getElementById("mStart");
    const mEnd = document.getElementById("mEnd");
    const mFreq = document.getElementById("mFreq");
    const singleDateBox = document.getElementById("singleDateBox");
    const singleDateInput = document.getElementById("mSingleDateInput");

    if (mDay) mDay.value = day;
    if (mStart) mStart.value = `${h < 10 ? "0" + h : h}:00`;
    if (mEnd) mEnd.value = `${h + 2 < 10 ? "0" + (h + 2) : h + 2}:00`;
    if (mFreq) mFreq.value = "Chaque semaine";
    if (singleDateBox) singleDateBox.style.display = "none";

    const d = new Date(state.currentMonday);
    d.setDate(d.getDate() + day);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dateStr = String(d.getDate()).padStart(2, "0");
    if (singleDateInput) singleDateInput.value = `${y}-${m}-${dateStr}`;
  }
  const el = document.getElementById(id);
  if (el) el.style.display = "flex";
};

window.closeModal = function (id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
};

let pendingConfirmAction = null;
window.showStyledConfirm = function (title, msg, icon, onConfirm) {
  const titleEl = document.getElementById("customConfirmTitle");
  const msgEl = document.getElementById("customConfirmMsg");
  const icoEl = document.getElementById("customConfirmIcon");
  const okBtn = document.getElementById("customConfirmOkBtn");

  if (titleEl) titleEl.innerText = title || "Confirmation";
  if (msgEl) msgEl.innerText = msg || "Confirmer cette action ?";
  if (icoEl) icoEl.innerText = icon || "⚠️";

  pendingConfirmAction = onConfirm;
  if (okBtn) {
    okBtn.onclick = function () {
      window.closeModal("customConfirmModal");
      if (pendingConfirmAction) pendingConfirmAction();
    };
  }
  window.openModal("customConfirmModal");
};

window.toggleDarkMode = function () {
  document.body.classList.toggle("dark-mode");
  const isDark = document.body.classList.contains("dark-mode");
  localStorage.setItem("app_dark_mode", isDark ? "true" : "false");
  const btn = document.getElementById("btnToggleDark");
  if (btn) btn.innerText = isDark ? "☀️ Mode Clair" : "🌙 Mode Sombre";
};
