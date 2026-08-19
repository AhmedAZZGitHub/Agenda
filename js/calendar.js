// js/calendar.js
// Gestion du Planning (Grille PC & Vue Mobile), Détails & Modification de Séance, Examens et Minuteur

import { database, ref, set, remove, update } from "./firebase-config.js?v=6.0";
import {
  state,
  getStudentPath,
  getMon,
  formatM,
  getSubjectMeta,
  getEventStatus,
  showLoading,
  hideLoading,
  playBeep,
} from "./state.js?v=6.0";
import { renderDetailSessionMap, initEditPickerMap } from "./maps.js?v=6.0";

let activeDetailSessionId = null;
let activeDetailSessionDate = null;

export function getSessionDateKey(dayIdx, refMonday = state.currentMonday) {
  const d = new Date(refMonday);
  d.setDate(d.getDate() + dayIdx);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const date = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

let timerInterval = null;
let timerSeconds = 25 * 60;
let timerRunning = false;

export function setLayout(l) {
  state.layout = l;
  localStorage.setItem("app_layout_final", l);
  render();
}

export function render() {
  const btnMob = document.getElementById("btnMob");
  const btnPc = document.getElementById("btnPc");
  const mobV = document.getElementById("mobView");
  const pcV = document.getElementById("pcView");

  if (state.layout === "mobile") {
    if (btnMob) btnMob.className = "btn-view active";
    if (btnPc) btnPc.className = "btn-view";
    if (mobV) mobV.style.display = "block";
    if (pcV) pcV.style.display = "none";
    renderMob();
  } else {
    if (btnPc) btnPc.className = "btn-view active";
    if (btnMob) btnMob.className = "btn-view";
    if (mobV) mobV.style.display = "none";
    if (pcV) pcV.style.display = "block";
    renderPc();
  }

  const sun = new Date(state.currentMonday);
  sun.setDate(sun.getDate() + 6);
  const lbl = document.getElementById("dateLabel");
  if (lbl) {
    lbl.innerText =
      state.layout === "pc"
        ? `${state.currentMonday.getDate()} ${state.months[state.currentMonday.getMonth()].toUpperCase()} – ${sun.getDate()} ${state.months[sun.getMonth()].toUpperCase()}`
        : `${state.days[state.curDayIdx]} ${new Date(state.currentMonday.getTime() + state.curDayIdx * 86400000).getDate()} ${state.months[new Date(state.currentMonday.getTime() + state.curDayIdx * 86400000).getMonth()]}`;
  }

  renderExams();
  updateHomeStreak();
}

export function renderPc() {
  const pHead = document.getElementById("pcHeader");
  if (!pHead) return;
  pHead.innerHTML = '<div style="background:var(--dash);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:var(--muted);">H</div>';

  const now = new Date();
  const isThisWeek = state.currentMonday.getDate() === getMon(now).getDate() && state.currentMonday.getMonth() === getMon(now).getMonth();
  const realDay = (now.getDay() + 6) % 7;

  for (let i = 0; i < 7; i++) {
    const d = new Date(state.currentMonday);
    d.setDate(d.getDate() + i);
    const isToday = isThisWeek && i === realDay;
    pHead.innerHTML += `<div style="background:${isToday ? "#0284c7" : "var(--dash)"};color:${isToday ? "#fff" : "var(--text)"};border-radius:10px;padding:6px;text-align:center;font-weight:700;font-size:12px;cursor:pointer;" onclick="window.curDayIdx=${i};window.render();">${state.days[i]}<br><span style="font-size:10px;opacity:0.85;">${d.getDate()} ${state.months[d.getMonth()]}</span></div>`;
  }

  const tCol = document.getElementById("timeCol");
  if (!tCol) return;
  tCol.innerHTML = "";
  for (let h = 8; h <= 24; h++) tCol.innerHTML += `<div class="h-slot">${h === 24 ? "00" : h < 10 ? "0" + h : h}:00</div>`;

  const dCol = document.getElementById("daysCol");
  if (!dCol) return;
  dCol.innerHTML = "";
  for (let day = 0; day < 7; day++) {
    const col = document.createElement("div");
    col.className = "col-day";
    for (let h = 8; h <= 24; h++) {
      const clickAttr = state.isReadOnly ? "" : `onclick="window.openModal('addModal', ${day}, ${h === 24 ? 23 : h})"`;
      col.innerHTML += `<div class="h-slot" ${clickAttr}></div>`;
    }

    const dateKey = getSessionDateKey(day);
    state.db
      .filter((e) => e.day === day)
      .forEach((ev) => {
        const meta = getSubjectMeta(ev.sub);
        const status = getEventStatus(ev.day, ev.s, ev.e);
        const top = ((ev.s - 480) / 60) * 46;
        const hPx = Math.max(30, ((ev.e - ev.s) / 60) * 46);

        const isQuin = ev.freq && ev.freq.includes("quinzaine");
        const isHome = ev.type && ev.type.includes("maison");
        const isOnline = ev.type && ev.type.includes("ligne");
        const isPart = ev.type && ev.type.includes("Particulier");

        const todoKey = `${ev.id}_${dateKey}`;
        const todoObj = state.sessionDateTodos && state.sessionDateTodos[todoKey];
        const hasTodo = Boolean(todoObj && todoObj.todo && todoObj.todo.trim());
        const isDone = todoObj && todoObj.todoDone === true;

        const c = document.createElement("div");
        c.className = `event-card ${meta.cls} ${status.class}`;
        c.style.top = `${top}px`;
        c.style.height = `${hPx}px`;
        c.innerHTML = `
          <div>
            ${status.text}
            <div style="font-weight:800; font-size:10.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${meta.ico} ${ev.sub}
            </div>
            <div style="margin-top:1px; display:flex; gap:2px; flex-wrap:wrap;">
              ${isPart ? `<span class="tag-meta" style="background:#7c3aed; color:white; cursor:pointer;" onclick="event.stopPropagation(); window.openMapViewer('${ev.id}')" title="Voir l'emplacement sur la carte">📍 ${ev.location?.address ? (ev.location.address.length > 12 ? ev.location.address.substring(0, 12) + "..." : ev.location.address) : "Particulier"}</span>` : ev.type ? `<span class="tag-meta" style="${isHome ? "background:#059669; color:white;" : isOnline ? "background:#0891b2; color:white;" : ""}">${ev.type}</span>` : ""}
              ${isQuin ? `<span class="tag-meta" style="background:#f59e0b; color:white;">1/2</span>` : ""}
              ${hasTodo ? `<span class="tag-meta" style="${isDone ? "background:#059669; color:white; font-weight:800;" : "background:#ea580c; color:white; font-weight:800;"}" onclick="event.stopPropagation(); window.toggleSessionTodoDone('${ev.id}', '${dateKey}', event)" title="Exercices pour le ${dateKey} : ${todoObj.todo.replace(/"/g, '&quot;')} (Cliquer pour basculer Fait/Non fait)">${isDone ? "✅ Ex. Fait" : "⏳ Ex. À faire"}</span>` : ""}
            </div>
          </div>
          <div style="font-size:9px; opacity:0.85; font-weight:700;">${formatM(ev.s)} - ${formatM(ev.e)}</div>
        `;

        c.style.cursor = "pointer";
        c.onclick = (e) => {
          e.stopPropagation();
          window.openSessionDetails(ev.id, dateKey);
        };
        col.appendChild(c);
      });
    dCol.appendChild(col);
  }
}

export function renderMob() {
  const sc = document.getElementById("mobScroller");
  if (!sc) return;
  sc.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(state.currentMonday);
    d.setDate(d.getDate() + i);
    sc.innerHTML += `<div class="mob-chip ${i === state.curDayIdx ? "active" : ""}" onclick="window.curDayIdx=${i};window.render();"><div style="font-size:12px;font-weight:700;">${state.days[i].substring(0, 3)}</div><div style="font-size:10px;">${d.getDate()} ${state.months[d.getMonth()]}</div></div>`;
  }
  const ml = document.getElementById("mobList");
  if (!ml) return;
  ml.innerHTML = "";
  const dayEvs = state.db.filter((e) => e.day === state.curDayIdx).sort((a, b) => a.s - b.s);
  if (!dayEvs.length) {
    ml.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);font-size:13px;">☕ Aucune séance prévue ce jour-là.</div>';
    return;
  }
  const curDateKey = getSessionDateKey(state.curDayIdx);
  dayEvs.forEach((ev) => {
    const meta = getSubjectMeta(ev.sub);
    const status = getEventStatus(ev.day, ev.s, ev.e);
    const isQuin = ev.freq && ev.freq.includes("quinzaine");
    const isHome = ev.type && ev.type.includes("maison");
    const isOnline = ev.type && ev.type.includes("ligne");
    const isPart = ev.type && ev.type.includes("Particulier");

    const todoKey = `${ev.id}_${curDateKey}`;
    const todoObj = state.sessionDateTodos && state.sessionDateTodos[todoKey];
    const hasTodo = Boolean(todoObj && todoObj.todo && todoObj.todo.trim());
    const isDone = todoObj && todoObj.todoDone === true;

    ml.innerHTML += `
      <div class="mob-card ${meta.cls} ${status.class}" style="cursor: pointer;" onclick="window.openSessionDetails('${ev.id}', '${curDateKey}')">
        <div>
          ${status.text}
          <div style="font-size:14px;font-weight:800;">${meta.ico} ${ev.sub}</div>
          <div style="margin:3px 0; display:flex; gap:3px; flex-wrap:wrap;">
            ${isPart ? `<span class="tag-meta" style="background:#7c3aed; color:white; font-weight:800;">📍 ${ev.location?.address || "Cours Particulier"}</span>` : ev.type ? `<span class="tag-meta" style="${isHome ? "background:#059669; color:white;" : isOnline ? "background:#0891b2; color:white;" : ""}">${ev.type}</span>` : ""}
            ${isQuin ? `<span class="tag-meta" style="background:#f59e0b; color:white;">1/2 quinzaine</span>` : ""}
            ${hasTodo ? `<span class="tag-meta" style="${isDone ? "background:#059669; color:white; font-weight:800;" : "background:#ea580c; color:white; font-weight:800;"}" onclick="event.stopPropagation(); window.toggleSessionTodoDone('${ev.id}', '${curDateKey}', event)" title="Cliquer pour basculer Fait/Non fait">${isDone ? "✅ Exercices Faits" : "⏳ Exercices À faire"}</span>` : ""}
          </div>
          <div style="font-size:12px;opacity:0.85;font-weight:600;">🕒 ${formatM(ev.s)} - ${formatM(ev.e)}</div>
        </div>
        <button onclick="event.stopPropagation(); window.openSessionDetails('${ev.id}', '${curDateKey}')" style="border:none;background:none;font-size:18px;cursor:pointer;" title="Détails & Modification">ℹ️</button>
      </div>
    `;
  });
}

export function shift(d) {
  if (state.layout === "pc") {
    state.currentMonday = new Date(state.currentMonday.getTime() + d * 7 * 86400000);
  } else {
    let newDay = state.curDayIdx + d;
    if (newDay > 6) {
      state.currentMonday = new Date(state.currentMonday.getTime() + 7 * 86400000);
      state.curDayIdx = 0;
    } else if (newDay < 0) {
      state.currentMonday = new Date(state.currentMonday.getTime() - 7 * 86400000);
      state.curDayIdx = 6;
    } else {
      state.curDayIdx = newDay;
    }
  }
  render();
}

export function goToToday() {
  const n = new Date();
  state.currentMonday = getMon(n);
  state.curDayIdx = (n.getDay() + 6) % 7;
  render();
}

export function clearAllData() {
  if (state.isReadOnly) return;
  window.showStyledConfirm(
    "Vider tout le planning",
    "Attention : Toutes vos séances enregistrées seront définitivement supprimées.",
    "⚠️",
    () => {
      set(ref(database, getStudentPath("seances")), null);
    }
  );
}

export function saveEvent() {
  if (state.isReadOnly) return alert("Accès en lecture seule.");
  const sub = document.getElementById("mSub")?.value.trim();
  if (!sub) return;
  const type = document.getElementById("mType")?.value;
  const freq = document.getElementById("mFreq")?.value;
  const [sH, sM] = (document.getElementById("mStart")?.value || "08:00").split(":").map(Number);
  const [eH, eM] = (document.getElementById("mEnd")?.value || "10:00").split(":").map(Number);

  const newId = Date.now().toString();

  let locData = null;
  if (type === "Particulier") {
    const addr = document.getElementById("mLocationText")?.value.trim() || "Cours Particulier";
    const lat = parseFloat(document.getElementById("mLocationLat")?.value) || 36.8065;
    const lng = parseFloat(document.getElementById("mLocationLng")?.value) || 10.1815;
    locData = { address: addr, lat, lng };
  }

  const newEvent = {
    id: newId,
    day: parseInt(document.getElementById("mDay")?.value || "0"),
    s: sH * 60 + sM,
    e: eH * 60 + eM,
    sub,
    type,
    freq,
    location: locData,
  };

  set(ref(database, getStudentPath("seances/" + newId)), newEvent);
  window.closeModal("addModal");
}

export function deleteEvent(id) {
  if (state.isReadOnly) return;
  window.showStyledConfirm(
    "Supprimer la séance",
    "Voulez-vous vraiment retirer cette séance de votre planning ?",
    "🗑️",
    () => {
      remove(ref(database, getStudentPath("seances/" + id)));
    }
  );
}export function openSessionDetails(id, explicitDateKey = null) {
  const ev = state.db.find((e) => e.id === id);
  if (!ev) return;
  activeDetailSessionId = id;

  const dateKey = explicitDateKey || getSessionDateKey(ev.day);
  activeDetailSessionDate = dateKey;

  const meta = getSubjectMeta(ev.sub);
  const durMin = ev.e - ev.s;
  const durHours = (durMin / 60).toFixed(1).replace(".0", "");

  const icoEl = document.getElementById("sdIco");
  const subEl = document.getElementById("sdSubTitle");
  const timeEl = document.getElementById("sdTimeBadge");
  const typeEl = document.getElementById("sdTypeVal");
  const freqEl = document.getElementById("sdFreqVal");
  const todoInp = document.getElementById("sdTodoText");
  const todoDoneInp = document.getElementById("sdTodoDone");

  let formattedDateHeader = `🗓️ ${state.days[ev.day]}`;
  if (dateKey) {
    const parts = dateKey.split("-").map(Number);
    if (parts.length === 3) {
      const dObj = new Date(parts[0], parts[1] - 1, parts[2]);
      formattedDateHeader = `🗓️ ${state.days[ev.day]} ${dObj.getDate()} ${state.months[dObj.getMonth()]}`;
    }
  }

  if (icoEl) icoEl.innerText = meta.ico;
  if (subEl) subEl.innerText = `${ev.sub} (Coef ${meta.coef || 1})`;
  if (timeEl) timeEl.innerText = `${formattedDateHeader} • ${formatM(ev.s)} - ${formatM(ev.e)} (${durHours}h)`;
  if (typeEl) typeEl.innerText = ev.type || "À la maison";
  if (freqEl) freqEl.innerText = ev.freq || "Chaque semaine";

  // Récupération des devoirs/exercices isolés pour CETTE date précise
  const todoKey = `${id}_${dateKey}`;
  const dateTodo = (state.sessionDateTodos && state.sessionDateTodos[todoKey]) || {};

  if (todoInp) todoInp.value = dateTodo.todo || "";
  if (todoDoneInp) todoDoneInp.checked = dateTodo.todoDone === true;
  updateSdTodoStatusButton(dateTodo.todoDone === true);

  const isPart = ev.type && ev.type.includes("Particulier");
  const mapSec = document.getElementById("sdParticularMapSection");
  const locAddrEl = document.getElementById("sdLocationAddressText");
  const gNavBtn = document.getElementById("sdBtnGoogleNav");
  const copyAddrBtn = document.getElementById("sdBtnCopyAddr");

  if (isPart || ev.location) {
    const loc = ev.location || { address: "Cours Particulier", lat: 36.8065, lng: 10.1815 };
    if (mapSec) mapSec.style.display = "flex";
    if (locAddrEl) locAddrEl.innerText = loc.address || "Cours Particulier";

    if (gNavBtn) {
      gNavBtn.onclick = function () {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`, "_blank");
      };
    }
    if (copyAddrBtn) {
      copyAddrBtn.onclick = function () {
        navigator.clipboard.writeText(loc.address || "Cours Particulier");
        alert("📋 Adresse copiée : " + (loc.address || "Cours Particulier"));
      };
    }
    renderDetailSessionMap(loc, meta, ev.sub);
  } else {
    if (mapSec) mapSec.style.display = "none";
  }

  const editId = document.getElementById("sdEditId");
  const editSub = document.getElementById("sdEditSub");
  const editType = document.getElementById("sdEditType");
  const editFreq = document.getElementById("sdEditFreq");
  const editDay = document.getElementById("sdEditDay");
  const editStart = document.getElementById("sdEditStart");
  const editEnd = document.getElementById("sdEditEnd");
  const editLocText = document.getElementById("sdEditLocText");
  const editLocLat = document.getElementById("sdEditLocLat");
  const editLocLng = document.getElementById("sdEditLocLng");

  if (editId) editId.value = ev.id;
  if (editSub) editSub.value = ev.sub;
  if (editType) editType.value = ev.type || "À la maison";
  if (editFreq) editFreq.value = ev.freq || "Toutes les semaines";
  if (editDay) editDay.value = ev.day;
  if (editStart) editStart.value = formatM(ev.s);
  if (editEnd) editEnd.value = formatM(ev.e);

  const locObj = ev.location || { address: "", lat: 36.8065, lng: 10.1815 };
  if (editLocText) editLocText.value = locObj.address || "";
  if (editLocLat) editLocLat.value = locObj.lat || 36.8065;
  if (editLocLng) editLocLng.value = locObj.lng || 10.1815;

  switchSdTab("overview");
  window.openModal("sessionDetailModal");
}

export function switchSdTab(tab) {
  const tabOverviewBtn = document.getElementById("sdTabOverviewBtn");
  const tabEditBtn = document.getElementById("sdTabEditBtn");
  const viewOverview = document.getElementById("sdViewOverview");
  const viewEdit = document.getElementById("sdViewEdit");

  if (tabOverviewBtn) tabOverviewBtn.classList.toggle("active", tab === "overview");
  if (tabEditBtn) tabEditBtn.classList.toggle("active", tab === "edit");
  if (viewOverview) viewOverview.style.display = tab === "overview" ? "flex" : "none";
  if (viewEdit) viewEdit.style.display = tab === "edit" ? "flex" : "none";

  if (tab === "edit") {
    const type = document.getElementById("sdEditType")?.value || "À la maison";
    onEditSessionTypeChange(type);
  }
}

export function onEditSessionTypeChange(val) {
  const mapBox = document.getElementById("sdEditMapBox");
  if (val === "Particulier") {
    if (mapBox) mapBox.style.display = "flex";
    const lat = parseFloat(document.getElementById("sdEditLocLat")?.value) || 36.8065;
    const lng = parseFloat(document.getElementById("sdEditLocLng")?.value) || 10.1815;
    setTimeout(() => {
      initEditPickerMap(lat, lng);
    }, 150);
  } else {
    if (mapBox) mapBox.style.display = "none";
  }
}

export async function saveQuickSessionTodo(explicitDoneStatus = null) {
  if (state.isReadOnly || !activeDetailSessionId || !activeDetailSessionDate) return;
  const textEl = document.getElementById("sdTodoText");
  const todo = textEl ? textEl.value.trim() : "";
  const checkbox = document.getElementById("sdTodoDone");

  let todoDone = checkbox ? checkbox.checked : false;
  if (explicitDoneStatus !== null) {
    todoDone = explicitDoneStatus;
    if (checkbox) checkbox.checked = todoDone;
  }

  updateSdTodoStatusButton(todoDone);

  const key = `${activeDetailSessionId}_${activeDetailSessionDate}`;
  if (!state.sessionDateTodos) state.sessionDateTodos = {};

  if (!todo && !todoDone) {
    delete state.sessionDateTodos[key];
    await remove(ref(database, getStudentPath(`seances_todos/${key}`)));
  } else {
    const todoObj = {
      todo,
      todoDone,
      date: activeDetailSessionDate,
      sessionId: activeDetailSessionId,
    };
    state.sessionDateTodos[key] = todoObj;
    await set(ref(database, getStudentPath(`seances_todos/${key}`)), todoObj);
  }

  // Purge de l'ancien champ global todo sur la séance pour éviter qu'il n'apparaisse sur d'autres semaines
  try {
    const ev = state.db.find((s) => s.id === activeDetailSessionId);
    if (ev && (ev.todo || ev.todoDone)) {
      delete ev.todo;
      delete ev.todoDone;
      await update(ref(database, getStudentPath(`seances/${activeDetailSessionId}`)), {
        todo: null,
        todoDone: null,
      });
    }
  } catch (e) {}

  render();
}

export function updateSdTodoStatusButton(isDone) {
  const btn = document.getElementById("sdTodoStatusToggleBtn");
  if (btn) {
    if (isDone) {
      btn.innerHTML = "✅ Exercices Faits";
      btn.style.background = "#dcfce7";
      btn.style.color = "#15803d";
      btn.style.borderColor = "#86efac";
    } else {
      btn.innerHTML = "⏳ Non fait (À faire)";
      btn.style.background = "#fee2e2";
      btn.style.color = "#b91c1c";
      btn.style.borderColor = "#fca5a5";
    }
  }
}

export function toggleSdTodoStatus() {
  const checkbox = document.getElementById("sdTodoDone");
  const current = checkbox ? checkbox.checked : false;
  saveQuickSessionTodo(!current);
}

export function askTutorAboutSessionTodo() {
  const todo = document.getElementById("sdTodoText")?.value.trim();
  const sub = document.getElementById("sdSubTitle")?.innerText || "";
  window.closeModal("sessionDetailModal");
  window.openTutorChat();
  const prompt = todo
    ? `Bonjour ! Dans mon cours de ${sub}, j'ai ces exercices à faire :\n"${todo}"\nPeux-tu m'expliquer la méthode et me donner des conseils pour les résoudre ?`
    : `Bonjour ! Peux-tu me donner des exercices d'entraînement types Bac pour mon cours de ${sub} ?`;
  window.useTutorQuickPrompt(prompt);
}

export async function toggleSessionTodoDone(sessionId, dateKey, e) {
  if (e) e.stopPropagation();
  if (state.isReadOnly) return;
  const key = `${sessionId}_${dateKey}`;
  const currentObj = (state.sessionDateTodos && state.sessionDateTodos[key]) || {};
  const newDone = !currentObj.todoDone;
  if (!state.sessionDateTodos) state.sessionDateTodos = {};
  state.sessionDateTodos[key] = {
    ...currentObj,
    todoDone: newDone,
    date: dateKey,
    sessionId: sessionId,
  };
  await update(ref(database, getStudentPath(`seances_todos/${key}`)), {
    todoDone: newDone,
    date: dateKey,
    sessionId: sessionId,
  });
  render();
}

export async function handleSaveEditedSession(e) {
  e.preventDefault();
  if (state.isReadOnly || !activeDetailSessionId) return alert("Accès en lecture seule.");

  const sub = document.getElementById("sdEditSub")?.value.trim();
  const type = document.getElementById("sdEditType")?.value;
  const freq = document.getElementById("sdEditFreq")?.value;
  const day = parseInt(document.getElementById("sdEditDay")?.value || "0");
  const [sH, sM] = (document.getElementById("sdEditStart")?.value || "08:00").split(":").map(Number);
  const [eH, eM] = (document.getElementById("sdEditEnd")?.value || "10:00").split(":").map(Number);

  let locData = null;
  if (type === "Particulier") {
    const addr = document.getElementById("sdEditLocText")?.value.trim() || "Cours Particulier";
    const lat = parseFloat(document.getElementById("sdEditLocLat")?.value) || 36.8065;
    const lng = parseFloat(document.getElementById("sdEditLocLng")?.value) || 10.1815;
    locData = { address: addr, lat, lng };
  }

  showLoading("Enregistrement des modifications...");
  try {
    await update(ref(database, getStudentPath("seances/" + activeDetailSessionId)), {
      sub,
      type,
      freq,
      day,
      s: sH * 60 + sM,
      e: eH * 60 + eM,
      location: locData,
    });
    hideLoading();
    window.closeModal("sessionDetailModal");
    playBeep();
    alert("✨ Séance modifiée avec succès !");
  } catch (err) {
    hideLoading();
    alert("Erreur lors de la modification : " + err.message);
  }
}

export function handleDeleteActiveSession() {
  if (state.isReadOnly || !activeDetailSessionId) return;
  window.showStyledConfirm(
    "Supprimer la séance",
    "Voulez-vous vraiment retirer cette séance de votre planning ?",
    "🗑️",
    async () => {
      showLoading("Suppression...");
      await remove(ref(database, getStudentPath("seances/" + activeDetailSessionId)));
      hideLoading();
      window.closeModal("sessionDetailModal");
    }
  );
}

// --- EXAMENS ET DEVOIRS ---
export function saveExam() {
  if (state.isReadOnly) return alert("Accès en lecture seule.");
  const sub = document.getElementById("exSub")?.value;
  const type = document.getElementById("exType")?.value;
  const date = document.getElementById("exDate")?.value;
  const desc = document.getElementById("exDesc")?.value.trim();

  if (!sub || !date) return alert("Veuillez remplir la matière et la date.");

  const newId = Date.now().toString();
  set(ref(database, getStudentPath("examens/" + newId)), {
    id: newId,
    sub,
    type,
    date,
    desc,
  });

  const dInp = document.getElementById("exDesc");
  if (dInp) dInp.value = "";
  window.closeModal("addExamModal");
}

export function renderExams() {
  const container = document.getElementById("examsListContainer");
  if (!container) return;
  container.innerHTML = "";

  if (!state.examsDb.length) {
    container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--muted); font-size:13px;">📝 Aucun devoir ou examen planifié.</div>';
    return;
  }

  const sorted = [...state.examsDb].sort((a, b) => new Date(a.date) - new Date(b.date));

  sorted.forEach((ex) => {
    const meta = getSubjectMeta(ex.sub);
    const dateObj = new Date(ex.date);
    const formattedDate = dateObj.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

    container.innerHTML += `
      <div class="exam-card ${meta.cls}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div style="font-weight:800; font-size:14px;">${meta.ico} ${ex.sub}</div>
            <div style="font-size:11.5px; opacity:0.9; margin-top:2px; font-weight:700;">${ex.type}</div>
          </div>
          <span style="font-size:11px; font-weight:800; background:rgba(0,0,0,0.1); padding:2px 8px; border-radius:6px;">📅 ${formattedDate}</span>
        </div>
        ${ex.desc ? `<div style="font-size:11.5px; margin-top:6px; opacity:0.85;">${ex.desc}</div>` : ""}
        ${!state.isReadOnly ? `<div style="display:flex; justify-content:flex-end; margin-top:6px;"><button onclick="window.deleteExam('${ex.id}')" style="background:none; border:none; color:#ef4444; font-size:12px; cursor:pointer; font-weight:700;">🗑️ Supprimer</button></div>` : ""}
      </div>
    `;
  });
}

export function deleteExam(id) {
  if (state.isReadOnly) return;
  window.showStyledConfirm(
    "Supprimer l'examen",
    "Voulez-vous supprimer ce devoir / examen ?",
    "📝",
    () => {
      remove(ref(database, getStudentPath("examens/" + id)));
    }
  );
}

// --- STATS, MINUTEUR ET STREAKS ---
export function renderStatsData() {
  const filter = document.getElementById("statsFilterType")?.value || "Maison";
  const subjectsMap = {};
  let totalMinutes = 0;

  state.db.forEach((ev) => {
    const isHome = ev.type && ev.type.toLowerCase().includes("maison");
    const isOnline = ev.type && ev.type.toLowerCase().includes("ligne");

    if (filter === "Maison" && !isHome) return;
    if (filter === "Autonomie" && !isHome && !isOnline) return;

    const meta = getSubjectMeta(ev.sub);
    const dur = Math.max(0, ev.e - ev.s);
    subjectsMap[meta.name] = (subjectsMap[meta.name] || 0) + dur;
    totalMinutes += dur;
  });

  const cont = document.getElementById("statsContent");
  if (!cont) return;
  cont.innerHTML = "";

  const totHours = (totalMinutes / 60).toFixed(1);
  const totEl = document.getElementById("statsTotalHours");
  if (totEl) totEl.innerText = `${totHours}h`;

  const sorted = Object.entries(subjectsMap).sort((a, b) => b[1] - a[1]);

  if (!sorted.length) {
    cont.innerHTML = '<div style="text-align:center; padding:30px; color:var(--muted)">Aucune donnée d\'étude pour ce filtre.</div>';
    return;
  }

  sorted.forEach(([name, mins]) => {
    const meta = getSubjectMeta(name);
    const hours = (mins / 60).toFixed(1);
    const pct = totalMinutes > 0 ? Math.round((mins / totalMinutes) * 100) : 0;

    cont.innerHTML += `
      <div style="display:flex; flex-direction:column; gap:4px;">
        <div style="display:flex; justify-content:space-between; font-size:12.5px; font-weight:700;">
          <span>${meta.ico} ${name}</span>
          <span>${hours}h (${pct}%)</span>
        </div>
        <div style="height:8px; background:var(--dash); border-radius:99px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:var(--primary); border-radius:99px;"></div>
        </div>
      </div>
    `;
  });
}

export function openStats() {
  renderStatsData();
  window.openOverlay("statsOverlay");
}

export function renderTimer() {
  const m = Math.floor(timerSeconds / 60);
  const s = timerSeconds % 60;
  const disp = document.getElementById("timerDisplay");
  if (disp) disp.innerText = `${m < 10 ? "0" + m : m}:${s < 10 ? "0" + s : s}`;
}

export function openTimer() {
  window.openOverlay("timerOverlay");
  renderTimer();
}

export function setCustomTimer() {
  const inp = document.getElementById("timerCustomMinutes");
  const m = parseInt(inp ? inp.value : "25") || 25;
  timerSeconds = m * 60;
  renderTimer();
}

export function toggleTimer() {
  const btn = document.getElementById("btnTimerToggle");
  if (timerRunning) {
    clearInterval(timerInterval);
    timerRunning = false;
    if (btn) {
      btn.innerText = "▶️ Démarrer";
      btn.className = "btn-add";
    }
  } else {
    timerRunning = true;
    if (btn) {
      btn.innerText = "⏸️ Pause";
      btn.className = "btn-action";
    }
    timerInterval = setInterval(() => {
      if (timerSeconds > 0) {
        timerSeconds--;
        renderTimer();
      } else {
        clearInterval(timerInterval);
        timerRunning = false;
        playBeep();
        alert("⏰ Session Pomodoro terminée ! Prenez une pause.");
        if (btn) {
          btn.innerText = "▶️ Démarrer";
          btn.className = "btn-add";
        }
      }
    }, 1000);
  }
}

export function resetTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  const btn = document.getElementById("btnTimerToggle");
  if (btn) {
    btn.innerText = "▶️ Démarrer";
    btn.className = "btn-add";
  }
  setCustomTimer();
}

export function updateBacCountdown() {
  const bacDate = new Date("2027-06-09T08:00:00");
  const now = new Date();
  const diff = bacDate - now;

  const el = document.getElementById("bacCountdownDisplay");
  if (!el) return;

  if (diff <= 0) {
    el.innerText = "🎓 Épreuves en cours !";
    return;
  }

  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
  const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  el.innerText = `⏳ J-${d} • ${h}h ${m}m restants`;
}

export function updateHomeStreak() {
  const badge = document.getElementById("homeStreakBadge");
  if (!badge) return;

  const daysWithHome = new Set();
  state.db.forEach((ev) => {
    if (ev.type && (ev.type.includes("maison") || ev.type.includes("ligne"))) {
      daysWithHome.add(ev.day);
    }
  });

  const count = daysWithHome.size;
  badge.innerText = `🔥 Série d'étude (Maison/Ligne) : ${count}j / sem`;
}

// Global Window Bindings
window.setLayout = setLayout;
window.render = render;
window.shift = shift;
window.goToToday = goToToday;
window.clearAllData = clearAllData;
window.saveEvent = saveEvent;
window.deleteEvent = deleteEvent;
window.openSessionDetails = openSessionDetails;
window.switchSdTab = switchSdTab;
window.onEditSessionTypeChange = onEditSessionTypeChange;
window.getSessionDateKey = getSessionDateKey;
window.saveQuickSessionTodo = saveQuickSessionTodo;
window.updateSdTodoStatusButton = updateSdTodoStatusButton;
window.toggleSdTodoStatus = toggleSdTodoStatus;
window.askTutorAboutSessionTodo = askTutorAboutSessionTodo;
window.toggleSessionTodoDone = toggleSessionTodoDone;
window.handleSaveEditedSession = handleSaveEditedSession;
window.handleDeleteActiveSession = handleDeleteActiveSession;
window.saveExam = saveExam;
window.deleteExam = deleteExam;
window.renderStatsData = renderStatsData;
window.openStats = openStats;
window.openTimer = openTimer;
window.setCustomTimer = setCustomTimer;
window.toggleTimer = toggleTimer;
window.resetTimer = resetTimer;
