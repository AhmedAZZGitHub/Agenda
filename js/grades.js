// js/grades.js
// Gestion du Carnet Trimestriel, Calcul des Moyennes et Annales du Bac

import { database, ref, set, get } from "./firebase-config.js?v=13.0";
import { state, getStudentPath, getSubjectMeta } from "./state.js?v=13.0";

const bacSubjectsList = [
  { id: "math", name: "Mathématiques", coef: 4 },
  { id: "phys", name: "Sciences Physiques", coef: 4 },
  { id: "svt", name: "Sciences SVT", coef: 4 },
  { id: "info", name: "Informatique (TIC/Algo)", coef: 3 },
  { id: "philo", name: "Philosophie", coef: 1 },
  { id: "arabe", name: "Arabe", coef: 1 },
  { id: "francais", name: "Français", coef: 1 },
  { id: "anglais", name: "Anglais", coef: 1 },
  { id: "sport", name: "Sport", coef: 1 },
  { id: "option", name: "Option / Espagnol / Italien", coef: 1 },
];

export function initBacArchiveTabs() {
  const container = document.getElementById("bacSubjectTabsContainer");
  if (!container) return;
  container.innerHTML = "";

  bacSubjectsList.forEach((sub, idx) => {
    const meta = getSubjectMeta(sub.name);
    const activeClass = sub.id === state.currentBacSubjectId ? "active" : "";
    container.innerHTML += `
      <button class="btn-tab-item ${activeClass}" onclick="window.selectBacSubject('${sub.id}')">
        ${meta.ico} ${sub.name}
      </button>
    `;
  });
  renderBacArchiveGrid();
}

export function selectBacSubject(subId) {
  state.currentBacSubjectId = subId;
  initBacArchiveTabs();
}

let bacArchiveFilter = "all";
export function setBacFilter(filter) {
  bacArchiveFilter = filter;
  document.querySelectorAll(".bac-filter-btn").forEach((btn) => btn.classList.remove("active"));
  const activeBtn = document.getElementById(
    filter === "all" ? "filterBacAll" : filter === "done" ? "filterBacDone" : "filterBacStarred"
  );
  if (activeBtn) activeBtn.classList.add("active");
  renderBacArchiveGrid();
}

export function searchBacOnline(subjectName, year, type = "sujet") {
  const query = encodeURIComponent(`bac tunisie ${subjectName} ${year} ${type} pdf`);
  window.open(`https://www.google.com/search?q=${query}`, "_blank");
}

export function renderBacArchiveGrid() {
  const grid = document.getElementById("bacArchiveGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const sub = bacSubjectsList.find((s) => s.id === state.currentBacSubjectId) || bacSubjectsList[0];
  const manifestData = window.BAC_MANIFEST_DATA?.[sub.id] || {};
  const years = Object.keys(manifestData).sort((a, b) => b - a);

  if (!years.length) {
    for (let y = 2026; y >= 2008; y--) years.push(y.toString());
  }

  let totalExams = 0;
  let doneCount = 0;

  years.forEach((year) => {
    const sessions = ["Principale", "Contrôle"];
    sessions.forEach((sess) => {
      totalExams++;
      const yKey = `${year}_${sess.toLowerCase()}`;
      const savedInfo = state.bacArchiveData?.[sub.id]?.[yKey] || {};
      const isDone = savedInfo.done === true;
      const isStarred = savedInfo.starred === true;

      if (isDone) doneCount++;

      if (bacArchiveFilter === "done" && !isDone) return;
      if (bacArchiveFilter === "starred" && !isStarred) return;

      const pdfUrl = savedInfo.customPdf || manifestData[year]?.[sess.toLowerCase()]?.pdf || null;
      const correcUrl = savedInfo.customCorrec || manifestData[year]?.[sess.toLowerCase()]?.correc || null;

      const card = document.createElement("div");
      card.className = `bac-card ${isDone ? "done" : ""}`;
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div style="font-weight:800; font-size:15px; color:var(--text);">Bac ${year} - Session ${sess}</div>
            <div style="font-size:11px; color:var(--muted); margin-top:2px;">${sub.name} (Coef ${sub.coef})</div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn-icon-star ${isStarred ? "active" : ""}" onclick="window.toggleBacStar('${sub.id}', '${yKey}', ${!isStarred})" title="Mettre en favori">
              ${isStarred ? "⭐" : "☆"}
            </button>
          </div>
        </div>

        <div style="display:flex; gap:6px; margin:8px 0; flex-wrap:wrap;">
          ${
            pdfUrl
              ? `<a href="${pdfUrl}" target="_blank" class="btn-pdf-link" style="text-decoration:none; padding:4px 10px; font-size:11.5px; border-radius:6px; background:var(--primary); color:white; font-weight:700;">📄 Sujet PDF</a>`
              : `<button class="btn-action" style="padding:4px 8px; font-size:11px;" onclick="window.searchBacOnline('${sub.name}', '${year}', 'sujet')">🔍 Trouver Sujet</button>`
          }
          ${
            correcUrl
              ? `<a href="${correcUrl}" target="_blank" class="btn-pdf-link" style="text-decoration:none; padding:4px 10px; font-size:11.5px; border-radius:6px; background:#059669; color:white; font-weight:700;">✅ Corrigé</a>`
              : `<button class="btn-action" style="padding:4px 8px; font-size:11px;" onclick="window.searchBacOnline('${sub.name}', '${year}', 'corrige')">🔍 Trouver Corrigé</button>`
          }
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--dash); padding-top:8px; margin-top:6px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; cursor:pointer; color:${isDone ? "#059669" : "var(--text)"};">
            <input type="checkbox" ${isDone ? "checked" : ""} onchange="window.toggleBacDone('${sub.id}', '${yKey}', this.checked)" />
            ${isDone ? "Révisé & Résolu ✅" : "Marquer comme fait"}
          </label>
        </div>
      `;
      grid.appendChild(card);
    });
  });

  const progressTxt = document.getElementById("bacArchiveProgressText");
  const percent = totalExams > 0 ? Math.round((doneCount / totalExams) * 100) : 0;
  if (progressTxt) progressTxt.innerText = `${doneCount} / ${totalExams} épreuves résolues (${percent}%)`;
  const bar = document.getElementById("bacArchiveProgressBar");
  if (bar) bar.style.width = `${percent}%`;
}

export function toggleBacDone(subId, yKey, isDone) {
  if (state.isReadOnly) return;
  set(ref(database, getStudentPath(`bac_archive/${subId}/${yKey}/done`)), isDone);
}

export function toggleBacStar(subId, yKey, isStarred) {
  if (state.isReadOnly) return;
  set(ref(database, getStudentPath(`bac_archive/${subId}/${yKey}/starred`)), isStarred);
}

export function saveBacPdf(subId, yKey, url) {
  if (state.isReadOnly) return;
  set(ref(database, getStudentPath(`bac_archive/${subId}/${yKey}/customPdf`)), url);
}

export function saveBacComment(subId, yKey, comment) {
  if (state.isReadOnly) return;
  set(ref(database, getStudentPath(`bac_archive/${subId}/${yKey}/comment`)), comment);
}

// --- CARNET DE NOTES TRIMESTRIEL ET MOYENNES ---
export function switchTrimester(trim) {
  state.currentTrimester = trim;
  document.querySelectorAll(".btn-tab-item").forEach((b) => b.classList.remove("active"));
  if (trim === "trim1") document.getElementById("tabTrim1")?.classList.add("active");
  if (trim === "trim2") document.getElementById("tabTrim2")?.classList.add("active");
  if (trim === "trim3") document.getElementById("tabTrim3")?.classList.add("active");
  if (trim === "year") document.getElementById("tabTrimYear")?.classList.add("active");

  if (trim === "year") {
    document.getElementById("trimesterTableView").style.display = "none";
    document.getElementById("annualSummaryView").style.display = "block";
    buildAnnualSummaryTable();
  } else {
    document.getElementById("trimesterTableView").style.display = "block";
    document.getElementById("annualSummaryView").style.display = "none";
    buildTrimesterTable();
  }
}

export function buildTrimesterTable() {
  const tbody = document.getElementById("trimesterTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const trimData = state.userGrades[state.currentTrimester] || {};

  bacSubjectsList.forEach((sub) => {
    const meta = getSubjectMeta(sub.name);
    const g = trimData[sub.id] || {};
    const hasOral = g.hasOral === true;
    const avg = computeSubjectAverage(g);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="font-weight:800; font-size:13px;">${meta.ico} ${sub.name}</div>
        <div style="font-size:10.5px; color:var(--muted);">Coef ${sub.coef}</div>
      </td>
      <td style="text-align:center;">
        <input type="checkbox" ${hasOral ? "checked" : ""} ${state.isReadOnly ? "disabled" : ""} onchange="window.toggleOralOption('${sub.id}')" />
      </td>
      <td>
        <input type="number" step="0.25" min="0" max="20" class="input grade-input" ${!hasOral ? "disabled style='opacity:0.4'" : ""} id="grade_oral_${sub.id}" value="${g.oral !== undefined && g.oral !== null ? g.oral : ""}" ${state.isReadOnly ? "disabled" : ""} onchange="window.saveTrimesterGradeInput('${sub.id}')" placeholder="--" />
      </td>
      <td>
        <input type="number" step="0.25" min="0" max="20" class="input grade-input" id="grade_dc_${sub.id}" value="${g.dc !== undefined && g.dc !== null ? g.dc : ""}" ${state.isReadOnly ? "disabled" : ""} onchange="window.saveTrimesterGradeInput('${sub.id}')" placeholder="--" />
      </td>
      <td>
        <input type="number" step="0.25" min="0" max="20" class="input grade-input" id="grade_ds_${sub.id}" value="${g.ds !== undefined && g.ds !== null ? g.ds : ""}" ${state.isReadOnly ? "disabled" : ""} onchange="window.saveTrimesterGradeInput('${sub.id}')" placeholder="--" />
      </td>
      <td style="font-weight:900; font-size:14px; color:${avg !== null ? (avg >= 10 ? "#059669" : "#dc2626") : "var(--muted)"};" id="sub_avg_${sub.id}">
        ${avg !== null ? avg.toFixed(2) : "--"}
      </td>
    `;
    tbody.appendChild(tr);
  });

  calculateTrimesterAverages();
}

export function toggleOralOption(subId) {
  if (state.isReadOnly) return;
  const trimData = state.userGrades[state.currentTrimester] || {};
  const current = trimData[subId]?.hasOral === true;
  set(ref(database, getStudentPath(`notes_trimestrielles/${state.currentTrimester}/${subId}/hasOral`)), !current);
  saveTrimesterGradeInput(subId);
}

export function saveTrimesterGradeInput(subId) {
  if (state.isReadOnly) return;
  const oralEl = document.getElementById(`grade_oral_${subId}`);
  const dcEl = document.getElementById(`grade_dc_${subId}`);
  const dsEl = document.getElementById(`grade_ds_${subId}`);

  const oralVal = oralEl && oralEl.value.trim() !== "" ? parseFloat(oralEl.value) : null;
  const dcVal = dcEl && dcEl.value.trim() !== "" ? parseFloat(dcEl.value) : null;
  const dsVal = dsEl && dsEl.value.trim() !== "" ? parseFloat(dsEl.value) : null;

  set(ref(database, getStudentPath(`notes_trimestrielles/${state.currentTrimester}/${subId}/oral`)), oralVal);
  set(ref(database, getStudentPath(`notes_trimestrielles/${state.currentTrimester}/${subId}/dc`)), dcVal);
  set(ref(database, getStudentPath(`notes_trimestrielles/${state.currentTrimester}/${subId}/ds`)), dsVal);
}

export function computeSubjectAverage(g) {
  if (!g) return null;
  const hasOral = g.hasOral === true;
  const oral = typeof g.oral === "number" ? g.oral : null;
  const dc = typeof g.dc === "number" ? g.dc : null;
  const ds = typeof g.ds === "number" ? g.ds : null;

  if (ds === null && dc === null && (!hasOral || oral === null)) return null;

  if (hasOral && oral !== null && dc !== null && ds !== null) {
    const cc = (oral + dc) / 2;
    return (cc + ds * 2) / 3;
  }
  if (dc !== null && ds !== null) {
    return (dc + ds * 2) / 3;
  }
  if (ds !== null) return ds;
  if (dc !== null) return dc;
  if (hasOral && oral !== null) return oral;
  return null;
}

export function calculateTrimesterAverages() {
  const trimData = state.userGrades[state.currentTrimester] || {};
  let totalPoints = 0;
  let totalCoef = 0;

  bacSubjectsList.forEach((sub) => {
    const g = trimData[sub.id] || {};
    const avg = computeSubjectAverage(g);
    if (avg !== null) {
      totalPoints += avg * sub.coef;
      totalCoef += sub.coef;
    }
  });

  const avgEl = document.getElementById("trimesterAverageDisplay");
  const pointsEl = document.getElementById("trimesterTotalPoints");
  const coefEl = document.getElementById("trimesterTotalCoef");

  if (totalCoef > 0) {
    const genAvg = totalPoints / totalCoef;
    if (avgEl) avgEl.innerText = genAvg.toFixed(2) + " / 20";
    if (pointsEl) pointsEl.innerText = totalPoints.toFixed(2);
    if (coefEl) coefEl.innerText = totalCoef;
  } else {
    if (avgEl) avgEl.innerText = "-- / 20";
    if (pointsEl) pointsEl.innerText = "--";
    if (coefEl) coefEl.innerText = "--";
  }
}

export function buildAnnualSummaryTable() {
  const tbody = document.getElementById("annualSummaryBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  let annualTotalPoints = 0;
  let annualTotalCoef = 0;

  bacSubjectsList.forEach((sub) => {
    const meta = getSubjectMeta(sub.name);
    const avgT1 = computeSubjectAverage(state.userGrades["trim1"]?.[sub.id]);
    const avgT2 = computeSubjectAverage(state.userGrades["trim2"]?.[sub.id]);
    const avgT3 = computeSubjectAverage(state.userGrades["trim3"]?.[sub.id]);

    const validAvgs = [avgT1, avgT2, avgT3].filter((a) => a !== null);
    const annualSubAvg = validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : null;

    if (annualSubAvg !== null) {
      annualTotalPoints += annualSubAvg * sub.coef;
      annualTotalCoef += sub.coef;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="font-weight:800; font-size:13px;">${meta.ico} ${sub.name}</div>
        <div style="font-size:10.5px; color:var(--muted);">Coef ${sub.coef}</div>
      </td>
      <td style="font-weight:700;">${avgT1 !== null ? avgT1.toFixed(2) : "--"}</td>
      <td style="font-weight:700;">${avgT2 !== null ? avgT2.toFixed(2) : "--"}</td>
      <td style="font-weight:700;">${avgT3 !== null ? avgT3.toFixed(2) : "--"}</td>
      <td style="font-weight:900; font-size:14px; color:${annualSubAvg !== null ? (annualSubAvg >= 10 ? "#059669" : "#dc2626") : "var(--muted)"};">
        ${annualSubAvg !== null ? annualSubAvg.toFixed(2) : "--"}
      </td>
    `;
    tbody.appendChild(tr);
  });

  const totAvgEl = document.getElementById("totalTrimesterAverage");
  const totPtsEl = document.getElementById("totalPointsSum");
  const totCoefEl = document.getElementById("totalCoefSum");

  if (annualTotalCoef > 0) {
    const annualGenAvg = annualTotalPoints / annualTotalCoef;
    if (totAvgEl) totAvgEl.innerText = annualGenAvg.toFixed(2) + " / 20";
    if (totPtsEl) totPtsEl.innerText = annualTotalPoints.toFixed(2);
    if (totCoefEl) totCoefEl.innerText = annualTotalCoef;
  } else {
    if (totAvgEl) totAvgEl.innerText = "-- / 20";
    if (totPtsEl) totPtsEl.innerText = "--";
    if (totCoefEl) totCoefEl.innerText = "--";
  }
}

// Global Window Bindings
window.selectBacSubject = selectBacSubject;
window.setBacFilter = setBacFilter;
window.searchBacOnline = searchBacOnline;
window.renderBacArchiveGrid = renderBacArchiveGrid;
window.toggleBacDone = toggleBacDone;
window.toggleBacStar = toggleBacStar;
window.saveBacPdf = saveBacPdf;
window.saveBacComment = saveBacComment;
window.switchTrimester = switchTrimester;
window.toggleOralOption = toggleOralOption;
window.saveTrimesterGradeInput = saveTrimesterGradeInput;
window.calculateTrimesterAverages = calculateTrimesterAverages;
