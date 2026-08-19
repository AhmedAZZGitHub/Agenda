// js/grades.js
// Gestion du Carnet Trimestriel, Calcul des Moyennes et Annales du Bac (2000 -> 2026)

import { database, ref, set } from "./firebase-config.js?v=15.6";
import { state, getStudentPath, getSubjectMeta } from "./state.js?v=15.6";

export const bacSubjectsList = [
  { id: "math", manifestKey: "math", name: "Mathématiques", coef: 4 },
  { id: "phys", manifestKey: "phys", name: "Sciences Physiques", coef: 4 },
  { id: "svt", manifestKey: "svt", name: "Sciences SVT", coef: 4 },
  { id: "info", manifestKey: "info", name: "Informatique (TIC/Algo)", coef: 3 },
  { id: "philo", manifestKey: "philo", name: "Philosophie", coef: 1 },
  { id: "arabe", manifestKey: "arab", name: "Arabe", coef: 1 },
  { id: "francais", manifestKey: "franc", name: "Français", coef: 1 },
  { id: "anglais", manifestKey: "angl", name: "Anglais", coef: 1 },
  { id: "sport", manifestKey: "sport", name: "Sport", coef: 1 },
  { id: "option", manifestKey: "option", name: "Option / Espagnol", coef: 1 },
];

let bacArchiveFilter = "all";

export function openBacArchiveOverlay() {
  if (!state.currentBacSubjectId) state.currentBacSubjectId = "math";
  bacArchiveFilter = "all";

  const searchInput = document.getElementById("bacYearFilterInput");
  if (searchInput) searchInput.value = "";

  const filterBtns = ["bacFilterAll", "bacFilterStarred", "bacFilterDone", "bacFilterTodo"];
  filterBtns.forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.toggle("active", btnId === "bacFilterAll");
  });

  const overlay = document.getElementById("bacArchiveOverlay");
  if (overlay) overlay.style.display = "flex";

  initBacArchiveTabs();
}

export function resetBacFilters() {
  bacArchiveFilter = "all";
  const searchInput = document.getElementById("bacYearFilterInput");
  if (searchInput) searchInput.value = "";

  const filterBtns = ["bacFilterAll", "bacFilterStarred", "bacFilterDone", "bacFilterTodo"];
  filterBtns.forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.toggle("active", btnId === "bacFilterAll");
  });

  renderBacArchiveGrid();
}

export function initBacArchiveTabs() {
  const container = document.getElementById("bacArchiveSubjectTabs") || document.getElementById("bacSubjectTabsContainer");
  if (!container) return;

  if (!state.currentBacSubjectId) state.currentBacSubjectId = "math";

  let html = "";
  bacSubjectsList.forEach((sub) => {
    const meta = getSubjectMeta(sub.name);
    const isActive = sub.id === state.currentBacSubjectId;
    html += `
      <button type="button" class="btn-tab-item ${isActive ? "active" : ""}" onclick="window.selectBacSubject('${sub.id}')">
        ${meta.ico} ${sub.name}
      </button>
    `;
  });
  container.innerHTML = html;

  renderBacArchiveGrid();
}

export function selectBacSubject(subId) {
  if (subId) state.currentBacSubjectId = subId;
  else if (!state.currentBacSubjectId) state.currentBacSubjectId = "math";
  initBacArchiveTabs();
}

export function setBacFilter(filter) {
  bacArchiveFilter = filter;
  const filterBtns = ["bacFilterAll", "bacFilterStarred", "bacFilterDone", "bacFilterTodo"];
  filterBtns.forEach((btnId) => {
    const btn = document.getElementById(btnId);
    if (btn) btn.classList.remove("active");
  });

  const activeBtnId =
    filter === "all"
      ? "bacFilterAll"
      : filter === "starred"
      ? "bacFilterStarred"
      : filter === "done"
      ? "bacFilterDone"
      : "bacFilterTodo";

  const activeBtn = document.getElementById(activeBtnId);
  if (activeBtn) activeBtn.classList.add("active");

  renderBacArchiveGrid();
}

export function searchBacOnline(subjectName, year, type = "sujet") {
  const query = encodeURIComponent(`bac tunisie ${subjectName} ${year} ${type} pdf`);
  window.open(`https://www.google.com/search?q=${query}`, "_blank");
}

export function renderBacArchiveGrid() {
  const grid = document.getElementById("bacExamsGrid") || document.getElementById("bacArchiveGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const sub = bacSubjectsList.find((s) => s.id === state.currentBacSubjectId) || bacSubjectsList[0];
  const subjectNameEl = document.getElementById("bacCurrentSubjectName");
  if (subjectNameEl) subjectNameEl.innerText = sub.name;

  const manifest = window.BAC_LOCAL_MANIFEST || window.BAC_MANIFEST_DATA || {};
  const manifestData = manifest[sub.manifestKey] || manifest[sub.id] || {};

  // Recherche par année
  const searchInput = document.getElementById("bacYearFilterInput");
  const searchQuery = searchInput ? searchInput.value.trim() : "";

  // Compter le nombre total de fichiers PDF locaux disponibles
  let totalLocalFiles = 0;
  Object.keys(manifest).forEach((k) => {
    const sObj = manifest[k] || {};
    Object.keys(sObj).forEach((yr) => {
      if (sObj[yr]?.sujet) totalLocalFiles++;
      if (sObj[yr]?.correction) totalLocalFiles++;
    });
  });
  const localCounterEl = document.getElementById("bacLocalFilesCounter");
  if (localCounterEl && totalLocalFiles > 0) {
    localCounterEl.innerText = `📁 ${totalLocalFiles} Fichiers PDF Locaux Prêts (2009 → 2026)`;
  }

  // Liste des 27 années officielles de 2026 à 2000
  const allYears = [];
  for (let y = 2026; y >= 2000; y--) {
    allYears.push(y.toString());
  }

  let totalExams = allYears.length;
  let doneCount = 0;
  let displayedCount = 0;

  allYears.forEach((year) => {
    const savedInfo = state.bacArchiveData?.[sub.id]?.[year] || state.bacArchiveData?.[sub.id]?.[`${year}_principale`] || {};
    const isDone = savedInfo.done === true;
    const isStarred = savedInfo.starred === true;

    if (isDone) doneCount++;

    // Filtres
    if (searchQuery && !year.includes(searchQuery)) return;
    if (bacArchiveFilter === "done" && !isDone) return;
    if (bacArchiveFilter === "todo" && isDone) return;
    if (bacArchiveFilter === "starred" && !isStarred) return;

    displayedCount++;

    const localEntry = manifestData[year] || {};
    const pdfUrl = savedInfo.customPdf || localEntry.sujet || (localEntry.principale?.pdf) || null;
    const correcUrl = savedInfo.customCorrec || localEntry.correction || (localEntry.principale?.correc) || null;

    const card = document.createElement("div");
    card.className = `bac-exam-box ${isDone ? "is-done" : ""} ${isStarred ? "is-starred" : ""}`;
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-weight:900; font-size:15px; color:var(--text);">Bac ${year} - Session Principale</div>
          <div style="font-size:11.5px; color:var(--muted); margin-top:2px; font-weight:700;">${sub.name} (Coef ${sub.coef})</div>
        </div>
        <button type="button" class="star-btn ${isStarred ? "starred" : ""}" onclick="window.toggleBacStar('${sub.id}', '${year}', ${!isStarred})" title="${isStarred ? "Retirer des favoris" : "Mettre en favori"}">
          ${isStarred ? "⭐" : "☆"}
        </button>
      </div>

      <div style="display:flex; gap:6px; margin:8px 0; flex-wrap:wrap;">
        ${
          pdfUrl
            ? `<a href="${pdfUrl}" target="_blank" class="btn-pdf-action">📄 Sujet PDF</a>`
            : `<button type="button" class="btn-action" style="padding:5px 9px; font-size:11px;" onclick="window.searchBacOnline('${sub.name}', '${year}', 'sujet')">🔍 Trouver Sujet</button>`
        }
        ${
          correcUrl
            ? `<a href="${correcUrl}" target="_blank" class="btn-pdf-action btn-corr">✅ Corrigé</a>`
            : `<button type="button" class="btn-action" style="padding:5px 9px; font-size:11px;" onclick="window.searchBacOnline('${sub.name}', '${year}', 'corrige')">🔍 Trouver Corrigé</button>`
        }
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--dash); padding-top:8px; margin-top:4px;">
        <label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; cursor:pointer; color:${isDone ? "#059669" : "var(--text)"};">
          <input type="checkbox" ${isDone ? "checked" : ""} onchange="window.toggleBacDone('${sub.id}', '${year}', this.checked)" />
          ${isDone ? "Révisé & Résolu ✅" : "Marquer comme fait"}
        </label>
        ${pdfUrl || correcUrl ? `<span style="font-size:10px; color:#059669; font-weight:800; background:#dcfce7; padding:2px 6px; border-radius:4px;">📁 PDF Local Prêt</span>` : `<span style="font-size:10px; color:var(--muted); font-weight:700;">Recherche Web</span>`}
      </div>
    `;
    grid.appendChild(card);
  });

  // Message si 0 résultat après filtrage
  if (displayedCount === 0) {
    const filterLabels = {
      all: "Tous",
      starred: "🌟 Favoris",
      done: "✅ Révisés",
      todo: "⏳ À faire",
    };
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; background: var(--card); border: 1.5px dashed var(--dash); border-radius: 16px;">
        <div style="font-size: 36px; margin-bottom: 8px;">🔍</div>
        <div style="font-weight: 800; font-size: 15px; color: var(--text);">Aucune épreuve ne correspond à vos filtres</div>
        <div style="font-size: 12.5px; color: var(--muted); margin-top: 4px; margin-bottom: 14px;">
          ${searchQuery ? `Recherche : "<b>${searchQuery}</b>" • ` : ""}Filtre : <b>${filterLabels[bacArchiveFilter] || bacArchiveFilter}</b>
        </div>
        <button type="button" class="btn-add" style="margin: 0 auto; padding: 8px 18px;" onclick="window.resetBacFilters()">
          🔄 Réinitialiser les filtres (Afficher tout)
        </button>
      </div>
    `;
  }

  const progressCountEl = document.getElementById("bacSubjectProgressCount");
  const progressPctEl = document.getElementById("bacSubjectProgressPct");
  const percent = totalExams > 0 ? ((doneCount / totalExams) * 100).toFixed(1) : "0.0";

  if (progressCountEl) progressCountEl.innerText = `${doneCount} / ${totalExams} Sujets Réalisés`;
  if (progressPctEl) progressPctEl.innerText = `${percent}% Complété`;
}

export function toggleBacDone(subId, yKey, isDone) {
  if (state.isReadOnly) return;
  if (!state.bacArchiveData) state.bacArchiveData = {};
  if (!state.bacArchiveData[subId]) state.bacArchiveData[subId] = {};
  if (!state.bacArchiveData[subId][yKey]) state.bacArchiveData[subId][yKey] = {};
  state.bacArchiveData[subId][yKey].done = isDone;

  set(ref(database, getStudentPath(`bac_archive/${subId}/${yKey}/done`)), isDone);
  renderBacArchiveGrid();
}

export function toggleBacStar(subId, yKey, isStarred) {
  if (state.isReadOnly) return;
  if (!state.bacArchiveData) state.bacArchiveData = {};
  if (!state.bacArchiveData[subId]) state.bacArchiveData[subId] = {};
  if (!state.bacArchiveData[subId][yKey]) state.bacArchiveData[subId][yKey] = {};
  state.bacArchiveData[subId][yKey].starred = isStarred;

  set(ref(database, getStudentPath(`bac_archive/${subId}/${yKey}/starred`)), isStarred);
  renderBacArchiveGrid();
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
export function openGradesOverlay() {
  const overlay = document.getElementById("gradesOverlay");
  if (overlay) overlay.style.display = "flex";
  switchTrimester(state.currentTrimester || "trim1");
}

export function openExamsOverlay() {
  const overlay = document.getElementById("examsOverlay");
  if (overlay) overlay.style.display = "flex";
  if (window.renderExams) window.renderExams();
}

export function switchTrimester(trim) {
  state.currentTrimester = trim;

  const tab1 = document.getElementById("tabTrim1");
  const tab2 = document.getElementById("tabTrim2");
  const tab3 = document.getElementById("tabTrim3");
  const tabYear = document.getElementById("tabTrimYear");

  if (tab1) tab1.classList.toggle("active", trim === "trim1");
  if (tab2) tab2.classList.toggle("active", trim === "trim2");
  if (tab3) tab3.classList.toggle("active", trim === "trim3");
  if (tabYear) tabYear.classList.toggle("active", trim === "year");

  const avgTitleEl = document.getElementById("avgCardTitle");
  if (avgTitleEl) {
    if (trim === "trim1") avgTitleEl.innerText = "MOYENNE DU 1ER TRIMESTRE";
    else if (trim === "trim2") avgTitleEl.innerText = "MOYENNE DU 2ÈME TRIMESTRE";
    else if (trim === "trim3") avgTitleEl.innerText = "MOYENNE DU 3ÈME TRIMESTRE";
    else if (trim === "year") avgTitleEl.innerText = "MOYENNE GÉNÉRALE ANNUELLE";
  }

  const trimView = document.getElementById("trimesterTableView");
  const yearView = document.getElementById("annualSummaryView");

  if (trim === "year") {
    if (trimView) trimView.style.display = "none";
    if (yearView) yearView.style.display = "block";
    buildAnnualSummaryTable();
  } else {
    if (trimView) trimView.style.display = "block";
    if (yearView) yearView.style.display = "none";
    buildTrimesterTable();
  }
}

export function buildTrimesterTable() {
  const tbody = document.getElementById("gradesTableBody") || document.getElementById("trimesterTableBody");
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
      <td style="text-align: left;">
        <div style="font-weight:800; font-size:13px;">${meta.ico} ${sub.name}</div>
        <div style="font-size:10.5px; color:var(--muted);">Coefficient ${sub.coef}</div>
      </td>
      <td style="font-weight:700;">${sub.coef}</td>
      <td>
        <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
          <input type="checkbox" title="Activer / Désactiver la note d'Oral/TP pour cette matière" ${hasOral ? "checked" : ""} ${state.isReadOnly ? "disabled" : ""} onchange="window.toggleOralOption('${sub.id}')" />
          <input type="number" step="0.25" min="0" max="20" class="input grade-input" ${!hasOral ? "disabled style='opacity:0.35'" : ""} id="grade_oral_${sub.id}" value="${g.oral !== undefined && g.oral !== null ? g.oral : ""}" ${state.isReadOnly ? "disabled" : ""} oninput="window.saveTrimesterGradeInput('${sub.id}')" placeholder="--" />
        </div>
      </td>
      <td>
        <input type="number" step="0.25" min="0" max="20" class="input grade-input" id="grade_dc_${sub.id}" value="${g.dc !== undefined && g.dc !== null ? g.dc : ""}" ${state.isReadOnly ? "disabled" : ""} oninput="window.saveTrimesterGradeInput('${sub.id}')" placeholder="--" />
      </td>
      <td>
        <input type="number" step="0.25" min="0" max="20" class="input grade-input" id="grade_ds_${sub.id}" value="${g.ds !== undefined && g.ds !== null ? g.ds : ""}" ${state.isReadOnly ? "disabled" : ""} oninput="window.saveTrimesterGradeInput('${sub.id}')" placeholder="--" />
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
  if (!state.userGrades[state.currentTrimester]) state.userGrades[state.currentTrimester] = {};
  if (!state.userGrades[state.currentTrimester][subId]) state.userGrades[state.currentTrimester][subId] = {};

  const current = state.userGrades[state.currentTrimester][subId]?.hasOral === true;
  state.userGrades[state.currentTrimester][subId].hasOral = !current;

  set(ref(database, getStudentPath(`notes_trimestrielles/${state.currentTrimester}/${subId}/hasOral`)), !current);
  buildTrimesterTable();
}

export function saveTrimesterGradeInput(subId) {
  if (state.isReadOnly) return;
  const oralEl = document.getElementById(`grade_oral_${subId}`);
  const dcEl = document.getElementById(`grade_dc_${subId}`);
  const dsEl = document.getElementById(`grade_ds_${subId}`);

  const oralVal = oralEl && oralEl.value.trim() !== "" ? parseFloat(oralEl.value) : null;
  const dcVal = dcEl && dcEl.value.trim() !== "" ? parseFloat(dcEl.value) : null;
  const dsVal = dsEl && dsEl.value.trim() !== "" ? parseFloat(dsEl.value) : null;

  if (!state.userGrades[state.currentTrimester]) state.userGrades[state.currentTrimester] = {};
  if (!state.userGrades[state.currentTrimester][subId]) state.userGrades[state.currentTrimester][subId] = {};

  state.userGrades[state.currentTrimester][subId].oral = oralVal;
  state.userGrades[state.currentTrimester][subId].dc = dcVal;
  state.userGrades[state.currentTrimester][subId].ds = dsVal;

  set(ref(database, getStudentPath(`notes_trimestrielles/${state.currentTrimester}/${subId}/oral`)), oralVal);
  set(ref(database, getStudentPath(`notes_trimestrielles/${state.currentTrimester}/${subId}/dc`)), dcVal);
  set(ref(database, getStudentPath(`notes_trimestrielles/${state.currentTrimester}/${subId}/ds`)), dsVal);

  const avg = computeSubjectAverage(state.userGrades[state.currentTrimester][subId]);
  const subAvgEl = document.getElementById(`sub_avg_${subId}`);
  if (subAvgEl) {
    subAvgEl.innerText = avg !== null ? avg.toFixed(2) : "--";
    subAvgEl.style.color = avg !== null ? (avg >= 10 ? "#059669" : "#dc2626") : "var(--muted)";
  }

  calculateTrimesterAverages();
}

export function computeSubjectAverage(g) {
  if (!g) return null;
  const hasOral = g.hasOral === true;
  const oral = typeof g.oral === "number" && !isNaN(g.oral) ? g.oral : null;
  const dc = typeof g.dc === "number" && !isNaN(g.dc) ? g.dc : null;
  const ds = typeof g.ds === "number" && !isNaN(g.ds) ? g.ds : null;

  if (ds === null && dc === null && (!hasOral || oral === null)) return null;

  // Formule officielle avec Oral : CC = (Oral + DC)/2, Moyenne = (CC + DS*2)/3
  if (hasOral && oral !== null && dc !== null && ds !== null) {
    const cc = (oral + dc) / 2;
    return (cc + ds * 2) / 3;
  }
  // Formule standard sans Oral : (DC + DS*2)/3
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
  const calcMode = document.getElementById("gradeCalcMode")?.value || "Trimestre";
  let totalPoints = 0;
  let totalCoef = 0;

  bacSubjectsList.forEach((sub) => {
    const g = trimData[sub.id] || {};
    const avg = computeSubjectAverage(g);

    if (avg !== null) {
      if (sub.id === "option" && calcMode === "Bac") {
        if (avg > 10) {
          totalPoints += avg - 10;
        }
      } else {
        totalPoints += avg * sub.coef;
        totalCoef += sub.coef;
      }
    }
  });

  const avgEl = document.getElementById("totalTrimesterAverage") || document.getElementById("trimesterAverageDisplay");
  const pointsEl = document.getElementById("totalPointsSum") || document.getElementById("trimesterTotalPoints");
  const coefEl = document.getElementById("totalCoefSum") || document.getElementById("trimesterTotalCoef");

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
  const tbody = document.getElementById("annualGradesTableBody") || document.getElementById("annualSummaryBody");
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
      <td style="text-align: left;">
        <div style="font-weight:800; font-size:13px;">${meta.ico} ${sub.name}</div>
        <div style="font-size:10.5px; color:var(--muted);">Coefficient ${sub.coef}</div>
      </td>
      <td style="font-weight:700;">${sub.coef}</td>
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
window.openBacArchiveOverlay = openBacArchiveOverlay;
window.resetBacFilters = resetBacFilters;
window.openGradesOverlay = openGradesOverlay;
window.openExamsOverlay = openExamsOverlay;
window.initBacArchiveTabs = initBacArchiveTabs;
window.selectBacSubject = selectBacSubject;
window.setBacFilter = setBacFilter;
window.searchBacOnline = searchBacOnline;
window.renderBacArchiveGrid = renderBacArchiveGrid;
window.toggleBacDone = toggleBacDone;
window.toggleBacStar = toggleBacStar;
window.saveBacPdf = saveBacPdf;
window.saveBacComment = saveBacComment;
window.switchTrimester = switchTrimester;
window.buildTrimesterTable = buildTrimesterTable;
window.toggleOralOption = toggleOralOption;
window.saveTrimesterGradeInput = saveTrimesterGradeInput;
window.calculateTrimesterAverages = calculateTrimesterAverages;
window.buildAnnualSummaryTable = buildAnnualSummaryTable;
