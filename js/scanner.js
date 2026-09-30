// js/scanner.js
// Module Scanner IA d'Emploi du Temps (Vision Scanner Google Gemini)
// GESTION PERSONNALISÉE DES GROUPES (TP/TD), DES OPTIONS ET RÈGLE STRICTE DE NON-RÉTROACTIVITÉ

import { database, ref, set, update } from "./firebase-config.js";
import { state, getStudentPath, showLoading, hideLoading, getMon, formatM, getSubjectMeta } from "./state.js?v=21.0";
import { render } from "./calendar.js?v=21.0";

let selectedScanFile = null;
let pendingScannedSessions = [];

export function getScannerApiKey() {
  return (
    localStorage.getItem("custom_gemini_api_key") ||
    localStorage.getItem("gemini_api_key") ||
    ""
  );
}

export function getScannerModelName() {
  return (
    localStorage.getItem("gemini_model_name") ||
    "gemini-3.6-flash"
  );
}

/**
 * Récupère le groupe mémorisé de l'élève (1 ou 2)
 */
export function getSavedStudentGroup() {
  return (
    localStorage.getItem("scan_student_group") ||
    state.currentUserProfile?.studentGroup ||
    "1"
  );
}

/**
 * Récupère l'option mémorisée de l'élève
 */
export function getSavedStudentOption() {
  return (
    localStorage.getItem("scan_student_option") ||
    state.currentUserProfile?.studentOption ||
    "Espagnol"
  );
}

/**
 * Mémorise le groupe et l'option choisis dans le profil et localStorage
 */
export async function saveStudentScanPrefs(group, option) {
  try {
    localStorage.setItem("scan_student_group", group);
    localStorage.setItem("scan_student_option", option);

    if (state.currentUser?.uid) {
      await update(ref(database, `users/${state.currentUser.uid}`), {
        studentGroup: group,
        studentOption: option,
      });
      if (state.currentUserProfile) {
        state.currentUserProfile.studentGroup = group;
        state.currentUserProfile.studentOption = option;
      }
    }
  } catch (e) {
    console.warn("Erreur sauvegarde préférences scan:", e);
  }
}

/**
 * Ouvre la modale de configuration du scan avec les pré-sélections mémorisées
 */
export function openScanConfigModal() {
  if (state.isReadOnly) return alert("Accès en lecture seule.");

  const savedGroup = getSavedStudentGroup();
  const savedOption = getSavedStudentOption();

  // Radio Groupe
  const groupRadios = document.querySelectorAll('input[name="scanGroupRadio"]');
  groupRadios.forEach((r) => {
    r.checked = r.value === String(savedGroup);
  });

  // Select Option
  const optSelect = document.getElementById("scanOptionSelect");
  if (optSelect) {
    optSelect.value = savedOption;
  }

  // Label Semaine de prise d'effet
  const baseMonday = state.currentMonday ? new Date(state.currentMonday) : getMon(new Date());
  const sun = new Date(baseMonday);
  sun.setDate(sun.getDate() + 6);
  const weekLabel = document.getElementById("scanActiveWeekLabel");
  if (weekLabel) {
    weekLabel.innerText = `Semaine du ${baseMonday.getDate()} ${state.months[baseMonday.getMonth()]} au ${sun.getDate()} ${state.months[sun.getMonth()]} ${baseMonday.getFullYear()}`;
  }

  // Badge fichier
  updateScanFileBadge();

  if (window.openModal) {
    window.openModal("scanConfigModal");
  }
}

/**
 * Met à jour le badge du fichier sélectionné
 */
function updateScanFileBadge() {
  const badge = document.getElementById("scanFileBadge");
  if (!badge) return;
  if (selectedScanFile) {
    const sizeKb = Math.round(selectedScanFile.size / 1024);
    badge.innerHTML = `📄 <b>${selectedScanFile.name}</b> (${sizeKb} Ko) <span style="color:#10b981; margin-left:6px;">✓ Prêt</span>`;
    badge.style.color = "var(--text)";
    badge.style.borderColor = "var(--primary)";
  } else {
    badge.innerText = "Aucun fichier sélectionné (Cliquez sur 'Choisir une photo')";
    badge.style.color = "var(--muted)";
    badge.style.borderColor = "var(--dash)";
  }
}

/**
 * Déclenchée lors de la sélection d'un fichier via le modal ou input externe
 */
export function onScannerFileSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  selectedScanFile = file;
  updateScanFileBadge();
}

/**
 * Interception de l'upload d'image (ex: clic toolbar)
 */
export function handleImageUpload(e) {
  if (state.isReadOnly) return alert("Accès en lecture seule.");
  const file = e.target.files?.[0];
  if (file) {
    selectedScanFile = file;
    updateScanFileBadge();
  }
  openScanConfigModal();
}

/**
 * Lance l'analyse de l'emploi du temps par Gemini Vision
 * avec injection stricte du Groupe et de l'Option
 */
export async function launchAiScheduleScan() {
  if (state.isReadOnly) return alert("Accès en lecture seule.");

  if (!selectedScanFile) {
    const photoInp = document.getElementById("scannerModalPhotoInput");
    if (photoInp) photoInp.click();
    return;
  }

  const apiKey = getScannerApiKey();
  if (!apiKey) {
    const proceed = confirm(
      "🔑 Clé API Google Gemini requise pour la Vision IA :\n\n" +
      "Pour analyser vos photos d'emploi du temps avec l'IA, veuillez configurer votre clé API Google Gemini (100% gratuite sur https://aistudio.google.com/app/apikey).\n\n" +
      "👉 Cliquez sur OK pour ouvrir les paramètres et coller votre clé."
    );
    if (proceed) {
      if (window.promptSetAiApiKey) window.promptSetAiApiKey();
      else if (window.openAiSettingsModal) window.openAiSettingsModal();
    }
    return;
  }

  // Lecture et sauvegarde des choix de l'élève
  const chosenGroup = document.querySelector('input[name="scanGroupRadio"]:checked')?.value || "1";
  const chosenOption = document.getElementById("scanOptionSelect")?.value || "Espagnol";
  await saveStudentScanPrefs(chosenGroup, chosenOption);

  showLoading(`🧠 Analyse IA de l'emploi du temps (Groupe ${chosenGroup} • ${chosenOption})...`);

  try {
    const reader = new FileReader();
    reader.onerror = function () {
      hideLoading();
      alert("Erreur de lecture du fichier image.");
    };

    reader.onload = async function () {
      try {
        const base64Data = reader.result.split(",")[1];
        const primaryModel = getScannerModelName();
        const fallbackModels = [
          primaryModel,
          "gemini-3.6-flash",
          "gemini-3.7-flash",
          "gemini-3.1-pro",
          "gemini-2.5-pro",
          "gemini-2.0-flash",
        ].filter((m, i, arr) => arr.indexOf(m) === i);

        let responseData = null;
        let lastError = null;

        // INSTRUCTION STRICTE AU PROMPT DU SCANNER (GEMINI VISION)
        const promptText = `Tu es un assistant expert pour les élèves de lycée en Tunisie (sections Scientifiques, Mathématiques, Sciences Expérimentales, Informatique, Technique, Économie-Gestion, Lettres).
Analyse cet emploi du temps officiel (ou photo de séances de cours/lycée) et extrait TOUTES les séances de cours qui concernent SPÉCIFIQUEMENT cet élève.

PROFIL DE L'ÉLÈVE :
- GROUPE : GROUPE ${chosenGroup}
- OPTION : ${chosenOption === "Aucune" ? "Aucune option (Pas de matière d'option)" : chosenOption}

RÈGLES D'EXTRACTION STRICTES :
1. Pour les cases d'options divisées (ex: Allemand / Espagnol / Italien / Russe / Chinois) :
   - N'extrais et n'inclus QUE l'option choisie (${chosenOption}).
   - Ignore et supprime complètement les autres matières d'option.
   - Si l'élève a choisi "Aucune", ignore et supprime toutes les options linguistiques.
2. Pour les séances dédoublées Groupe 1 / Groupe 2 (TP, labo, TD d'Informatique, Physique ou SVT) :
   - N'extrais QUE la séance correspondant au Groupe ${chosenGroup}.
   - Ignore la séance de l'autre groupe.
3. Retourne uniquement les séances réellement suivies par l'élève sous format JSON propre.

Réponds STRICTEMENT avec un tableau JSON valide au format suivant, sans aucun markdown ni texte autour :
[
  {
    "sub": "Mathématiques",
    "day": 0,
    "s": 480,
    "e": 600,
    "type": "Lycée"
  }
]
Format des champs :
- "sub" : Le nom officiel de la matière (ex: Mathématiques, Sciences Physiques, Sciences SVT, Informatique, Philosophie, Arabe, Français, Anglais, Sport, ${chosenOption !== "Aucune" ? chosenOption : "Option"}, Histoire-Géo).
- "day" : Indice du jour de la semaine (0 pour Lundi, 1 pour Mardi, 2 pour Mercredi, 3 pour Jeudi, 4 pour Vendredi, 5 pour Samedi, 6 pour Dimanche).
- "s" : Heure de début en minutes depuis minuit (ex: 8h00 = 480, 8h30 = 510, 9h00 = 540, 10h00 = 600, 14h00 = 840, 15h00 = 900, 16h00 = 960).
- "e" : Heure de fin en minutes depuis minuit (ex: 10h00 = 600, 11h00 = 660, 12h00 = 720, 16h00 = 960, 18h00 = 1080).
- "type" : "Lycée".`;

        for (const model of fallbackModels) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      { text: promptText },
                      {
                        inlineData: {
                          mimeType: selectedScanFile.type || "image/jpeg",
                          data: base64Data,
                        },
                      },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0.1,
                },
              }),
            });

            if (res.ok) {
              responseData = await res.json();
              break;
            } else {
              const errBody = await res.json().catch(() => ({}));
              lastError = errBody.error?.message || `HTTP ${res.status}`;
            }
          } catch (fetchErr) {
            lastError = fetchErr.message;
          }
        }

        if (!responseData) {
          throw new Error(lastError || "Impossible de contacter les serveurs Google Vision IA.");
        }

        const rawText = responseData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        let cleanJson = jsonMatch ? jsonMatch[0] : rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        const rawSessions = JSON.parse(cleanJson);

        if (!Array.isArray(rawSessions) || rawSessions.length === 0) {
          hideLoading();
          alert("⚠️ Aucune séance n'a été détectée sur cette photo. Assurez-vous que l'image est bien nette et éclairée.");
          return;
        }

        // Filtre client-side de sécurité préventive (double barrière)
        const filteredSessions = rawSessions.filter((s) => {
          const subLower = (s.sub || "").toLowerCase();

          // 1. Filtrage strict de l'Option
          const allOptions = ["espagnol", "allemand", "italien", "russe", "chinois"];
          if (chosenOption === "Aucune") {
            if (allOptions.some((opt) => subLower.includes(opt))) return false;
          } else {
            const chosenLower = chosenOption.toLowerCase();
            const otherOptions = allOptions.filter((opt) => opt !== chosenLower);
            if (otherOptions.some((opt) => subLower.includes(opt))) return false;
          }

          // 2. Filtrage strict du Groupe pour les TP/TD dédoublés
          if (chosenGroup === "1") {
            if (/\b(?:g2|gr2|groupe\s*2)\b/i.test(subLower)) return false;
          } else if (chosenGroup === "2") {
            if (/\b(?:g1|gr1|groupe\s*1)\b/i.test(subLower)) return false;
          }

          return true;
        });

        // Stocker pour l'étape de vérification
        pendingScannedSessions = filteredSessions.map((s, idx) => ({
          tempId: idx,
          sub: s.sub || "Cours",
          day: typeof s.day === "number" ? Math.max(0, Math.min(6, s.day)) : 0,
          s: typeof s.s === "number" ? s.s : 480,
          e: typeof s.e === "number" ? s.e : 600,
          type: s.type || "Lycée",
          selected: true,
        }));

        hideLoading();
        window.closeModal("scanConfigModal");
        openScanReviewModal(chosenGroup, chosenOption);
      } catch (innerErr) {
        hideLoading();
        console.error("Erreur Vision IA:", innerErr);
        if (innerErr.message.includes("blocked") || innerErr.message.includes("403") || innerErr.message.includes("PERMISSION_DENIED")) {
          const proceed = confirm(
            "⚠️ Clé API Google Gemini requise pour la Vision IA :\n\n" +
            "La clé par défaut du projet ne dispose pas des droits d'accès à l'API Vision (Erreur 403: API_KEY_SERVICE_BLOCKED).\n\n" +
            "👉 Voulez-vous coller votre propre clé API gratuite Google (obtenue en 30 secondes sur https://aistudio.google.com) pour scanner vos emplois du temps ?"
          );
          if (proceed) {
            if (window.promptSetAiApiKey) window.promptSetAiApiKey();
            else if (window.openAiSettingsModal) window.openAiSettingsModal();
          }
        } else {
          alert("⚠️ Erreur lors de l'analyse par l'IA :\n" + innerErr.message + "\n\n💡 Vérifiez votre clé API Google Gemini dans les paramètres ou réessayez avec une photo plus nette.");
        }
      }
    };

    reader.readAsDataURL(selectedScanFile);
  } catch (err) {
    hideLoading();
    alert("Erreur : " + err.message);
  }
}

/**
 * Ouvre l'interface de vérification avant enregistrement
 */
export function openScanReviewModal(group, option) {
  const subtitle = document.getElementById("scanReviewSubtitle");
  if (subtitle) {
    subtitle.innerHTML = `Séances extraites pour le <b>Groupe ${group}</b> avec l'option <b>${option}</b>. Décochez les séances indésirables :`;
  }

  renderScanReviewList();
  window.openModal("scanReviewModal");
}

/**
 * Affiche la liste des séances avec cases à cocher
 */
export function renderScanReviewList() {
  const listEl = document.getElementById("scanReviewList");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (pendingScannedSessions.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--muted); font-size:12px;">Aucune séance détectée.</div>';
    updateScanReviewCount();
    return;
  }

  // Tri par jour (0-6) puis par heure de début
  const sorted = [...pendingScannedSessions].sort((a, b) => a.day - b.day || a.s - b.s);

  sorted.forEach((item) => {
    const meta = getSubjectMeta(item.sub);
    const dayName = state.days[item.day] || "Jour";
    const timeStr = `${formatM(item.s)} - ${formatM(item.e)}`;

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "10px";
    row.style.padding = "8px 12px";
    row.style.background = item.selected ? "var(--dash)" : "rgba(255,255,255,0.02)";
    row.style.borderRadius = "10px";
    row.style.border = "1px solid var(--dash)";
    row.style.transition = "all 0.15s ease";
    row.style.cursor = "pointer";

    row.innerHTML = `
      <input type="checkbox" class="scan-item-chk" data-temp-id="${item.tempId}" ${item.selected ? "checked" : ""} style="width:18px; height:18px; accent-color:var(--primary); cursor:pointer;" />
      <div style="flex: 1; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight: 800; font-size: 13px; color: var(--text);">
            ${meta.ico} ${item.sub}
          </div>
          <div style="font-size: 11px; color: var(--muted); font-weight: 600;">
            ${dayName} • ${timeStr} • ${item.type}
          </div>
        </div>
        <span class="tag-meta" style="background:var(--primary); color:white; font-size:10px;">${dayName.substring(0, 3)}</span>
      </div>
    `;

    const chk = row.querySelector(".scan-item-chk");
    chk.onclick = (e) => e.stopPropagation();
    chk.onchange = () => {
      item.selected = chk.checked;
      row.style.background = item.selected ? "var(--dash)" : "rgba(255,255,255,0.02)";
      updateScanReviewCount();
    };

    row.onclick = () => {
      chk.checked = !chk.checked;
      item.selected = chk.checked;
      row.style.background = item.selected ? "var(--dash)" : "rgba(255,255,255,0.02)";
      updateScanReviewCount();
    };

    listEl.appendChild(row);
  });

  updateScanReviewCount();
}

/**
 * Met à jour le compteur de séances sélectionnées
 */
export function updateScanReviewCount() {
  const countBadge = document.getElementById("scanReviewCountBadge");
  const selectedCount = pendingScannedSessions.filter((s) => s.selected).length;
  if (countBadge) {
    countBadge.innerText = `${selectedCount} séance(s) sélectionnée(s) sur ${pendingScannedSessions.length}`;
  }
}

/**
 * Tout cocher / Décocher
 */
export function toggleAllScanReviewItems(checked) {
  pendingScannedSessions.forEach((s) => {
    s.selected = checked;
  });
  renderScanReviewList();
}

/**
 * Enregistrement final des séances sélectionnées dans Firebase
 * AVEC RESPECT STRICT DU START DATE LOCK (AUCUNE RÉTROACTIVITÉ)
 */
export async function commitScanReviewSessions() {
  if (state.isReadOnly) return alert("Accès en lecture seule.");

  const selectedSessions = pendingScannedSessions.filter((s) => s.selected);
  if (selectedSessions.length === 0) {
    return alert("Veuillez sélectionner au moins une séance à enregistrer.");
  }

  showLoading(`💾 Enregistrement de ${selectedSessions.length} séance(s)...`);

  try {
    // Borne minimale absolue : Lundi de la semaine affichée à l'écran
    const baseMonday = state.currentMonday ? new Date(state.currentMonday) : getMon(new Date());

    for (const s of selectedSessions) {
      const targetDate = new Date(baseMonday);
      targetDate.setDate(targetDate.getDate() + s.day);
      const startDateKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;

      const newId = Date.now().toString() + Math.floor(Math.random() * 10000);
      const newSessionObj = {
        id: newId,
        sub: s.sub || "Cours",
        day: s.day,
        s: s.s,
        e: s.e,
        type: s.type || "Lycée",
        freq: "Chaque semaine",
        startDate: startDateKey, // RÈGLE STRICTE : AUCUNE RÉTROACTIVITÉ SUR LES SEMAINES PASSÉES
      };

      await set(ref(database, getStudentPath("seances/" + newId)), newSessionObj);
      if (!state.db) state.db = [];
      state.db.push(newSessionObj);
    }

    if (typeof render === "function") render();
    hideLoading();
    window.closeModal("scanReviewModal");

    alert(`🎉 ${selectedSessions.length} séances ont été enregistrées avec succès !\n\n🔒 Règle de non-rétroactivité respectée :\nCes cours débutent à la semaine affichée. Vos semaines passées restent 100% intactes.`);
  } catch (err) {
    hideLoading();
    alert("Erreur lors de l'enregistrement : " + err.message);
  }
}

// Window Bindings
window.openScanConfigModal = openScanConfigModal;
window.onScannerFileSelected = onScannerFileSelected;
window.handleImageUpload = handleImageUpload;
window.launchAiScheduleScan = launchAiScheduleScan;
window.openScanReviewModal = openScanReviewModal;
window.renderScanReviewList = renderScanReviewList;
window.updateScanReviewCount = updateScanReviewCount;
window.toggleAllScanReviewItems = toggleAllScanReviewItems;
window.commitScanReviewSessions = commitScanReviewSessions;
