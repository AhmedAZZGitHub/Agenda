// js/jarvis-engine.js
// 🤖 Moteur IA - Assistant Vocal Intelligent (Élèves) & Copilote JARVIS Suprême (Administrateur)
// Function Calling Google Gemini (gemini-2.5-flash / Pro), Exécution Firebase en Direct & Synthèse Vocale

import { database, auth, ref, set, get, remove, update, sendPasswordResetEmail } from "./firebase-config.js?v=18.0";
import { state, getStudentPath, showLoading, hideLoading, formatM, getSubjectMeta } from "./state.js?v=18.0";
import { getSessionDateKey, render, openTimer, setTimerPreset, setCustomTimer, toggleTimer } from "./calendar.js?v=18.0";
import { loadAdminKPIs } from "./admin.js?v=18.0";
import { ARABIC_METHODOLOGY_KNOWLEDGE } from "./arabic-knowledge.js";
import { getAiModelName, getAiApiKey, cleanDuplicateWords } from "./ai-assistant.js?v=18.0";

// État de la synthèse vocale (Audio TTS activé par défaut)
let isJarvisAudioMuted = false;
try {
  const savedMute = localStorage.getItem("jarvis_audio_muted");
  if (savedMute !== null) isJarvisAudioMuted = savedMute === "true";
} catch (e) {}

export function isJarvisMuted() {
  return isJarvisAudioMuted;
}

export function toggleJarvisSpeechMute() {
  isJarvisAudioMuted = !isJarvisAudioMuted;
  localStorage.setItem("jarvis_audio_muted", isJarvisAudioMuted ? "true" : "false");
  if (isJarvisAudioMuted && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  const btns = document.querySelectorAll("#btnJarvisAudioToggle, #btnJarvisAudioToggleModal");
  btns.forEach((btn) => {
    btn.innerHTML = isJarvisAudioMuted ? "🔇 Voix Coupée" : "🔊 Voix Active";
    btn.classList.toggle("muted", isJarvisAudioMuted);
  });
  return !isJarvisAudioMuted;
}

export function speakJarvisResponse(text) {
  if (isJarvisAudioMuted || !("speechSynthesis" in window) || !text) return;
  try {
    window.speechSynthesis.cancel();
    // Nettoyer les balises HTML et le markdown pour une élocution naturelle
    const cleanSpeech = text
      .replace(/<[^>]*>/g, " ")
      .replace(/[\*\_#`~]/g, "")
      .replace(/([0-9]{1,2})h([0-9]{2})/gi, "$1 heures $2")
      .replace(/([0-9]{1,2})h\b/gi, "$1 heures")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!cleanSpeech) return;

    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.lang = "fr-FR";
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const frVoice = voices.find(
      (v) =>
        v.lang.startsWith("fr") &&
        (v.name.includes("Google") ||
          v.name.includes("Natural") ||
          v.name.includes("Thomas") ||
          v.name.includes("Henri") ||
          v.name.includes("Julie") ||
          v.name.includes("Audrey") ||
          v.name.includes("Aurelie"))
    );
    if (frVoice) utterance.voice = frVoice;

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Synthèse vocale non disponible:", err);
  }
}

// ============================================================
// 1. DÉCLARATION DES OUTILS SÉPARÉS (ÉLÈVE vs ADMIN)
// ============================================================

// OUTILS ÉLÈVES & PARENTS (GRAND PUBLIC)
export const STUDENT_TOOLS_DECLARATIONS = [
  {
    name: "ajouter_seance",
    description: "Ajoute une séance au planning. Extrait EXACTEMENT l'heure de début et de fin dictées (ex: 8h 10h -> 08:00 et 10:00). Si aucun travail n'est demandé, travail_a_faire doit être null.",
    parameters: {
      type: "OBJECT",
      properties: {
        matiere: {
          type: "STRING",
          description: "Matière (Mathématiques, Sciences Physiques, Sciences SVT, Informatique, Philosophie, Arabe, Français, Anglais, Économie & Gestion, Histoire-Géo, Sport, Option, Étude / Révision). Si non précisée, choisir 'Étude / Révision'.",
        },
        jour: {
          type: "STRING",
          description: "Jour de la séance ('Aujourd'hui', 'Demain', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche') ou index 0 à 6.",
        },
        heure_debut: {
          type: "STRING",
          description: "Heure de début EXACTE au format HH:MM (ex: '08:00', '09:00', '10:00', '14:00', '16:00'). NE PAS METTRE 14:00 SI L'UTILISATEUR A DIT UNE AUTRE HEURE.",
        },
        heure_fin: {
          type: "STRING",
          description: "Heure de fin EXACTE au format HH:MM (ex: '10:00', '12:00', '16:00', '18:00'). Si non précisée, calculer heure_debut + 2h.",
        },
        type_lieu: {
          type: "STRING",
          enum: ["À la maison", "En ligne", "Lycée", "Particulier"],
          description: "Type de cours (par défaut 'À la maison' ou 'Particulier' si mentionné).",
        },
        frequence: {
          type: "STRING",
          enum: ["Chaque semaine", "Par quinzaine", "Ce jour seulement"],
          description: "Fréquence de répétition.",
        },
        date_specifique: {
          type: "STRING",
          description: "Date exacte YYYY-MM-DD si séance ponctuelle.",
        },
        travail_a_faire: {
          type: "STRING",
          description: "UNIQUEMENT les exercices ou devoirs à faire (ex: 'Série 3 analyse', 'Exercices 1 et 4'). Doit être NULL si aucun travail n'est mentionné. NE JAMAIS METTRE LA COMMANDE DE L'UTILISATEUR DEDANS.",
        },
      },
      required: ["matiere", "jour", "heure_debut"],
    },
  },
  {
    name: "consulter_planning_jour",
    description: "Consulte et analyse le planning d'un jour donné (aujourd'hui, demain, samedi...) et résume les séances et exercices.",
    parameters: {
      type: "OBJECT",
      properties: {
        jour: {
          type: "STRING",
          description: "Jour concerné ('Aujourd'hui', 'Demain', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche').",
        },
        date: {
          type: "STRING",
          description: "Date YYYY-MM-DD si applicable.",
        },
      },
    },
  },
  {
    name: "modifier_devoir_seance",
    description: "Met à jour ou coche les devoirs d'une séance spécifique.",
    parameters: {
      type: "OBJECT",
      properties: {
        seance_id: {
          type: "STRING",
          description: "Nom de la matière ou ID de la séance.",
        },
        nouveau_travail: {
          type: "STRING",
          description: "Exercices ou devoirs à faire.",
        },
        est_fait: {
          type: "BOOLEAN",
          description: "true si terminé, false sinon.",
        },
      },
      required: ["seance_id"],
    },
  },
  {
    name: "programmer_examen",
    description: "Planifie un examen, devoir de contrôle (DC) ou synthèse (DS).",
    parameters: {
      type: "OBJECT",
      properties: {
        matiere: {
          type: "STRING",
          description: "Matière de l'examen.",
        },
        type_examen: {
          type: "STRING",
          enum: ["Devoir de Contrôle (DC)", "Devoir de Synthèse (DS)", "Examen Blanc"],
          description: "Type d'épreuve.",
        },
        date: {
          type: "STRING",
          description: "Date YYYY-MM-DD.",
        },
        programme: {
          type: "STRING",
          description: "Programme ou chapitres au menu.",
        },
      },
      required: ["matiere", "date"],
    },
  },
  {
    name: "regler_minuteur",
    description: "Règle et lance un minuteur de travail.",
    parameters: {
      type: "OBJECT",
      properties: {
        heures: { type: "NUMBER", description: "Nombre d'heures (0 si moins d'une heure)." },
        minutes: { type: "NUMBER", description: "Nombre de minutes." },
        demarrer_immediatement: { type: "BOOLEAN", description: "Lancer le compte à rebours immédiatement." },
      },
      required: ["minutes"],
    },
  },
  {
    name: "supprimer_seance",
    description: "Supprime une séance existante du planning.",
    parameters: {
      type: "OBJECT",
      properties: {
        seance_id: { type: "STRING", description: "ID ou matière de la séance à supprimer." },
        matiere: { type: "STRING", description: "Matière de la séance." },
      },
    },
  },
  {
    name: "vider_planning",
    description: "Vide tout l'emploi du temps de l'élève actuel.",
    parameters: {
      type: "OBJECT",
      properties: {
        confirmation: { type: "BOOLEAN", description: "Confirmation d'effacement." },
      },
    },
  },
];

// OUTILS EXCLUSIVEMENT RÉSERVÉS À L'ADMINISTRATEUR (JARVIS SUPRÊME)
export const ADMIN_TOOLS_DECLARATIONS = [
  {
    name: "approuver_demande_compte",
    description: "Approuve et active une demande de compte en attente. STRICTEMENT RÉSERVÉ ADMIN.",
    parameters: {
      type: "OBJECT",
      properties: {
        email_ou_nom: { type: "STRING", description: "Email ou nom de l'utilisateur à approuver." },
      },
      required: ["email_ou_nom"],
    },
  },
  {
    name: "refuser_ou_supprimer_compte",
    description: "Supprime un compte utilisateur et ses données. STRICTEMENT RÉSERVÉ ADMIN.",
    parameters: {
      type: "OBJECT",
      properties: {
        user_uid_ou_email: { type: "STRING", description: "UID ou email du compte." },
      },
      required: ["user_uid_ou_email"],
    },
  },
  {
    name: "activer_option_ia_compte",
    description: "Active ou désactive l'accès IA pour un élève. STRICTEMENT RÉSERVÉ ADMIN.",
    parameters: {
      type: "OBJECT",
      properties: {
        user_uid_ou_email: { type: "STRING", description: "UID ou email de l'élève." },
        statut: { type: "BOOLEAN", description: "true pour activer, false pour désactiver." },
      },
      required: ["user_uid_ou_email", "statut"],
    },
  },
  {
    name: "publier_annonce_globale",
    description: "Diffuse une annonce générale sur tous les comptes. STRICTEMENT RÉSERVÉ ADMIN.",
    parameters: {
      type: "OBJECT",
      properties: {
        titre: { type: "STRING", description: "Titre de l'annonce." },
        contenu: { type: "STRING", description: "Message de l'annonce." },
      },
      required: ["titre", "contenu"],
    },
  },
  {
    name: "inspecter_planning_eleve",
    description: "Supervise en direct le planning d'un élève. STRICTEMENT RÉSERVÉ ADMIN.",
    parameters: {
      type: "OBJECT",
      properties: {
        student_uid_ou_nom: { type: "STRING", description: "UID ou nom de l'élève." },
      },
      required: ["student_uid_ou_nom"],
    },
  },
];

// ============================================================
// 2. CONVERSION ET EXTRACTION ROBUSTE DES HORAIRES
// ============================================================
export function parseTimeToMinutes(tStr, defaultMin = 8 * 60) {
  if (tStr === undefined || tStr === null || tStr === "") return defaultMin;
  if (typeof tStr === "number") {
    if (tStr >= 0 && tStr <= 24) return tStr * 60;
    return tStr;
  }
  const str = String(tStr).trim().toLowerCase();

  // "08:30", "8:30", "08h30", "8h30", "8h", "08h", "8"
  const match =
    str.match(/^(\d{1,2})(?:[h:](\d{2}))?$/i) ||
    str.match(/(\d{1,2})\s*(?:h|:|\s*heures?)\s*(\d{2})?/i);

  if (match) {
    let h = parseInt(match[1], 10);
    let m = match[2] ? parseInt(match[2], 10) : 0;
    // Si l'utilisateur dit 1h à 6h l'après-midi
    if (h >= 1 && h <= 6 && (str.includes("soir") || str.includes("apres") || str.includes("3achiya") || str.includes("pm"))) {
      h += 12;
    }
    return h * 60 + m;
  }

  const num = parseInt(str, 10);
  if (!isNaN(num) && num >= 0 && num <= 24) {
    return num * 60;
  }

  return defaultMin;
}

// Extraction locale infaillible des plages horaires (ex: "8h 10h", "de 8h à 10h", "8h-10h", "8h", "14h")
export function extractTimeRangeFromText(rawText) {
  const text = (rawText || "").toLowerCase();

  // Plage explicite : "8h 10h", "8h à 10h", "de 8h à 10h", "men 8h l 10h", "8h-10h", "8:00 10:00"
  const rangeRegex = /(?:de|men|من)?\s*(\d{1,2})(?:h|:|\s*heures?)(\d{2})?\s*(?:a|à|hatta|ila|l|\-|et|w|حتى|إلى|\s)\s*(\d{1,2})(?:h|:|\s*heures?)(\d{2})?/i;
  const rangeMatch = text.match(rangeRegex);

  if (rangeMatch && rangeMatch[1] && rangeMatch[3]) {
    let sH = parseInt(rangeMatch[1], 10);
    let sM = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : 0;
    let eH = parseInt(rangeMatch[3], 10);
    let eM = rangeMatch[4] ? parseInt(rangeMatch[4], 10) : 0;

    // Ajustement après-midi si spécifié
    const isPm = /3achiya|après-midi|apres-midi|soir|pm/i.test(text);
    if (isPm) {
      if (sH < 12) sH += 12;
      if (eH < 12) eH += 12;
    }
    if (eH < sH && eH <= 12) eH += 12;

    return {
      startMin: sH * 60 + sM,
      endMin: eH * 60 + eM,
      startStr: `${sH < 10 ? "0" + sH : sH}:${sM < 10 ? "0" + sM : sM}`,
      endStr: `${eH < 10 ? "0" + eH : eH}:${eM < 10 ? "0" + eM : eM}`,
      found: true,
    };
  }

  // Heure unique : "8h", "m3a 8h", "à 10h", "14h"
  const singleRegex = /(?:m3a|a|à|fi|ساعة|مع)?\s*(\d{1,2})(?:h|:|\s*heures?)(\d{2})?/i;
  const singleMatch = text.match(singleRegex);

  if (singleMatch && singleMatch[1]) {
    let sH = parseInt(singleMatch[1], 10);
    let sM = singleMatch[2] ? parseInt(singleMatch[2], 10) : 0;

    const isPm = /3achiya|après-midi|apres-midi|soir|pm/i.test(text);
    if (isPm && sH < 12) sH += 12;

    const eH = Math.min(24, sH + 2);
    return {
      startMin: sH * 60 + sM,
      endMin: eH * 60 + sM,
      startStr: `${sH < 10 ? "0" + sH : sH}:${sM < 10 ? "0" + sM : sM}`,
      endStr: `${eH < 10 ? "0" + eH : eH}:${sM < 10 ? "0" + sM : sM}`,
      found: true,
    };
  }

  // Heure par défaut le matin (8h00 - 10h00)
  return {
    startMin: 8 * 60,
    endMin: 10 * 60,
    startStr: "08:00",
    endStr: "10:00",
    found: false,
  };
}

// Extraction propre et isolée du travail à faire (todo)
export function extractCleanTodo(rawText) {
  if (!rawText) return null;
  const match = rawText.match(
    /(?:travail(?:\s+à|\s+a)?\s+faire|exercices?|exos?|s[eé]rie|khedma|w\s+el\s+khedma|wal\s+khedma|w\s+khedma|الخدمة|والخدمة|تمارين|واجب|r[eé]vision|chapitre|tp|td)\s*[:=\s\-]+([^.]+)/i
  );
  if (match && match[1]) {
    const todo = cleanDuplicateWords(match[1].trim());
    if (todo && todo.length > 1) return todo;
  }
  return null;
}

// ============================================================
// 3. CONTEXTE LIVE DYNAMIQUE INJECTÉ DANS GEMINI
// ============================================================
export function buildJarvisLiveContext() {
  const now = new Date();
  const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const dayIdx = (now.getDay() + 6) % 7; // 0=Lundi, 6=Dimanche
  const currentDayName = dayNames[now.getDay()];
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const profile = state.currentUserProfile || {};
  const userRole = profile.role || "student";
  const userName = profile.displayName || profile.email?.split("@")[0] || "Utilisateur";
  const userSection = profile.section || "Baccalauréat";
  const isAdmin = userRole === "admin";

  const dateKey = getSessionDateKey(dayIdx);
  const todaySessions = (state.db || [])
    .filter((s) => s.day === dayIdx)
    .sort((a, b) => a.s - b.s)
    .map((s) => {
      const todoKey = `${s.id}_${dateKey}`;
      const todoObj = state.sessionDateTodos && state.sessionDateTodos[todoKey];
      const todoTxt = todoObj && todoObj.todo ? ` (Devoir: ${todoObj.todo})` : "";
      return `- ${s.sub} de ${formatM(s.s)} à ${formatM(s.e)} [${s.type || "Lycée"}]${todoTxt}`;
    });

  const todaySummary =
    todaySessions.length > 0
      ? `Séances d'aujourd'hui (${currentDayName} ${todayIso}) :\n${todaySessions.join("\n")}`
      : `Aucune séance planifiée aujourd'hui (${currentDayName} ${todayIso}).`;

  let adminContext = "";
  if (isAdmin && state.allUsersCache && state.allUsersCache.length > 0) {
    const pendingList = state.allUsersCache.filter((u) => u.status === "pending");
    adminContext = `\n[CONSOLE ADMINISTRATEUR DÉBLOQUÉE]
- Demandes en attente : ${pendingList.length} (${pendingList.map((u) => u.displayName || u.email).join(", ") || "Aucune"})
- Total comptes : ${state.allUsersCache.length}`;
  }

  return `Tu es l'Assistant Vocal et Tuteur intelligent officiel du Baccalauréat tunisien.
Date : ${currentDayName} ${todayIso}, ${currentTime}.
Utilisateur : ${userName} (${userRole}) - Section : ${userSection}.

${todaySummary}${adminContext}

RÈGLES IMPORTANTES :
1. HORAIRES EXACTS : Si l'utilisateur dit une heure (ex: "8h 10h", "de 8h à 10h", "9h", "16h"), extrais impérativement l'heure exacte (heure_debut = "08:00", heure_fin = "10:00"). NE METS JAMAIS 14:00 si une heure a été dictée.
2. TRAVAIL À FAIRE (TODO) : Le champ "travail_a_faire" ne doit contenir QUE les devoirs ou exercices demandés (ex: "Série 3 analyse"). Si aucun exercice n'est mentionné, mets impérativement null. NE METS JAMAIS la phrase de commande dans ce champ.
3. MATIÈRE : Si aucune matière n'est spécifiée (ex: "ajoute une séance demain 8h 10h"), choisis "Étude / Révision".
4. COMPRÉHENSION : Comprends parfaitement le français, l'arabe classique et le tunisien (Derja/Arabizi). Réponds de façon concise, naturelle et fluide.`;
}

// ============================================================
// 4. EXÉCUTION DES OUTILS SUR FIREBASE
// ============================================================
export async function executeJarvisToolCall(toolName, toolArgs) {
  const profile = state.currentUserProfile || {};
  const isAdmin = profile.role === "admin";

  switch (toolName) {
    // --- 1. AJOUTER UNE SÉANCE ---
    case "ajouter_seance": {
      if (state.isReadOnly) throw new Error("Accès en lecture seule.");
      const { matiere, jour, heure_debut, heure_fin, type_lieu, frequence, date_specifique, travail_a_faire } = toolArgs;

      // Calcul du jour index (0 à 6)
      let dayIdx = (new Date().getDay() + 6) % 7;
      if (typeof jour === "number") dayIdx = Math.max(0, Math.min(6, jour));
      else if (typeof jour === "string") {
        const jLow = jour.toLowerCase();
        if (jLow.includes("lun") || jLow.includes("thnin")) dayIdx = 0;
        else if (jLow.includes("mar") || jLow.includes("tlet")) dayIdx = 1;
        else if (jLow.includes("mer") || jLow.includes("arba")) dayIdx = 2;
        else if (jLow.includes("jeu") || jLow.includes("khmi")) dayIdx = 3;
        else if (jLow.includes("ven") || jLow.includes("jem") || jLow.includes("jom")) dayIdx = 4;
        else if (jLow.includes("sam") || jLow.includes("seb")) dayIdx = 5;
        else if (jLow.includes("dim") || jLow.includes("a7ad")) dayIdx = 6;
        else if (jLow.includes("demain") || jLow.includes("ghodwa")) dayIdx = (dayIdx + 1) % 7;
      }

      const sMin = parseTimeToMinutes(heure_debut, 8 * 60);
      const eMin = parseTimeToMinutes(heure_fin, sMin + 120);

      const targetDateKey = date_specifique || getSessionDateKey(dayIdx);
      const newId = Date.now().toString() + Math.floor(Math.random() * 1000);

      const finalSubject = matiere && matiere.trim() ? matiere.trim() : "Étude / Révision";

      const sessionObj = {
        id: newId,
        sub: finalSubject,
        day: dayIdx,
        s: sMin,
        e: Math.max(sMin + 30, eMin),
        type: type_lieu || "À la maison",
        freq: frequence || (date_specifique ? "Ce jour seulement" : "Chaque semaine"),
        singleDate: date_specifique || (frequence === "Ce jour seulement" ? targetDateKey : null),
        location: type_lieu === "Particulier" ? { address: "Cours Particulier", lat: 36.8065, lng: 10.1815 } : null,
      };

      await set(ref(database, getStudentPath("seances/" + newId)), sessionObj);
      if (!state.db) state.db = [];
      state.db.push(sessionObj);

      // Enregistrement du travail à faire SEULEMENT si non nul et non vide
      const cleanTodo = travail_a_faire ? cleanDuplicateWords(travail_a_faire.trim()) : null;
      if (cleanTodo && cleanTodo.length > 1 && !cleanTodo.includes("ajoute") && !cleanTodo.includes("séance")) {
        const todoKey = `${newId}_${targetDateKey}`;
        const todoObj = {
          todo: cleanTodo,
          todoDone: false,
          date: targetDateKey,
          sessionId: newId,
        };
        await set(ref(database, getStudentPath(`seances_todos/${todoKey}`)), todoObj);
        if (!state.sessionDateTodos) state.sessionDateTodos = {};
        state.sessionDateTodos[todoKey] = todoObj;
      }

      if (render) render();

      const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
      const timeStr = `${formatM(sMin)} - ${formatM(eMin)}`;
      return {
        succes: true,
        message: `Séance de ${finalSubject} ajoutée pour ${dayNames[dayIdx]} de ${timeStr} (${sessionObj.type})${cleanTodo ? ` avec devoir : "${cleanTodo}"` : ""}.`,
        details: sessionObj,
      };
    }

    // --- 2. CONSULTER LE PLANNING D'UN JOUR ---
    case "consulter_planning_jour": {
      const { jour, date } = toolArgs;
      let targetDayIdx = (new Date().getDay() + 6) % 7;

      if (typeof jour === "string") {
        const jLow = jour.toLowerCase();
        if (jLow.includes("demain") || jLow.includes("ghodwa")) targetDayIdx = (targetDayIdx + 1) % 7;
        else if (jLow.includes("apres") || jLow.includes("après") || jLow.includes("ba3d")) targetDayIdx = (targetDayIdx + 2) % 7;
        else if (jLow.includes("lun") || jLow.includes("thnin")) targetDayIdx = 0;
        else if (jLow.includes("mar") || jLow.includes("tlet")) targetDayIdx = 1;
        else if (jLow.includes("mer") || jLow.includes("arba")) targetDayIdx = 2;
        else if (jLow.includes("jeu") || jLow.includes("khmi")) targetDayIdx = 3;
        else if (jLow.includes("ven") || jLow.includes("jem") || jLow.includes("jom")) targetDayIdx = 4;
        else if (jLow.includes("sam") || jLow.includes("seb")) targetDayIdx = 5;
        else if (jLow.includes("dim") || jLow.includes("a7ad")) targetDayIdx = 6;
      }

      const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
      const targetDateKey = date || getSessionDateKey(targetDayIdx);

      const sessions = (state.db || [])
        .filter((s) => s.day === targetDayIdx)
        .sort((a, b) => a.s - b.s)
        .map((s) => {
          const todoKey = `${s.id}_${targetDateKey}`;
          const todoObj = state.sessionDateTodos && state.sessionDateTodos[todoKey];
          return {
            matiere: s.sub,
            debut: formatM(s.s),
            fin: formatM(s.e),
            type: s.type || "Lycée",
            travail: todoObj && todoObj.todo ? todoObj.todo : null,
            travail_fait: todoObj ? Boolean(todoObj.todoDone) : false,
          };
        });

      return {
        jour: dayNames[targetDayIdx],
        date: targetDateKey,
        total_seances: sessions.length,
        programme: sessions,
      };
    }

    // --- 3. MODIFIER DEVOIR SÉANCE ---
    case "modifier_devoir_seance": {
      if (state.isReadOnly) throw new Error("Accès en lecture seule.");
      const { seance_id, nouveau_travail, est_fait } = toolArgs;

      let targetSession = (state.db || []).find((s) => s.id === seance_id);
      if (!targetSession && typeof seance_id === "string") {
        targetSession = (state.db || []).find((s) => s.sub.toLowerCase().includes(seance_id.toLowerCase()));
      }

      if (!targetSession) throw new Error(`Séance non trouvée pour "${seance_id}".`);

      const dateKey = getSessionDateKey(targetSession.day);
      const todoKey = `${targetSession.id}_${dateKey}`;

      const existingTodo = (state.sessionDateTodos && state.sessionDateTodos[todoKey]) || {};
      const updatedTodo = {
        todo: nouveau_travail ? cleanDuplicateWords(nouveau_travail.trim()) : existingTodo.todo || "Exercices à préparer",
        todoDone: typeof est_fait === "boolean" ? est_fait : existingTodo.todoDone || false,
        date: dateKey,
        sessionId: targetSession.id,
      };

      await set(ref(database, getStudentPath(`seances_todos/${todoKey}`)), updatedTodo);
      if (!state.sessionDateTodos) state.sessionDateTodos = {};
      state.sessionDateTodos[todoKey] = updatedTodo;

      if (render) render();

      return {
        succes: true,
        message: `Devoir de ${targetSession.sub} mis à jour : "${updatedTodo.todo}" (${updatedTodo.todoDone ? "✅ Fait" : "⏳ À faire"}).`,
      };
    }

    // --- 4. PROGRAMMER EXAMEN ---
    case "programmer_examen": {
      if (state.isReadOnly) throw new Error("Accès en lecture seule.");
      const { matiere, type_examen, date, programme } = toolArgs;
      const newId = Date.now().toString();

      const examObj = {
        id: newId,
        sub: matiere || "Mathématiques",
        type: type_examen || "Devoir de Contrôle (DC)",
        date: date || new Date().toISOString().split("T")[0],
        desc: programme || "Planifié via l'Assistant IA",
      };

      await set(ref(database, getStudentPath("examens/" + newId)), examObj);
      if (!state.examsDb) state.examsDb = [];
      state.examsDb.push(examObj);

      if (render) render();

      return {
        succes: true,
        message: `${examObj.type} de ${examObj.sub} programmé pour le ${examObj.date}.`,
        examen: examObj,
      };
    }

    // --- 5. RÉGLER MINUTEUR ---
    case "regler_minuteur": {
      const { heures, minutes, demarrer_immediatement } = toolArgs;
      const h = parseInt(heures, 10) || 0;
      const m = parseInt(minutes, 10) || 25;

      setTimerPreset(h, m);
      openTimer();

      if (demarrer_immediatement !== false) {
        setTimeout(() => toggleTimer(), 250);
      }

      return {
        succes: true,
        message: `Minuteur réglé sur ${h > 0 ? h + "h " : ""}${m} minutes et lancé.`,
      };
    }

    // --- 6. SUPPRIMER SÉANCE ---
    case "supprimer_seance": {
      if (state.isReadOnly) throw new Error("Accès en lecture seule.");
      const { seance_id, matiere } = toolArgs;

      let found = (state.db || []).find((s) => s.id === seance_id);
      if (!found && matiere) {
        found = (state.db || []).find((s) => s.sub.toLowerCase().includes(matiere.toLowerCase()));
      }

      if (!found) throw new Error("Séance à supprimer introuvable.");

      await remove(ref(database, getStudentPath("seances/" + found.id)));
      state.db = state.db.filter((s) => s.id !== found.id);

      if (render) render();

      return {
        succes: true,
        message: `Séance de ${found.sub} supprimée du planning.`,
      };
    }

    // --- 7. VIDER PLANNING ---
    case "vider_planning": {
      if (state.isReadOnly) throw new Error("Accès en lecture seule.");
      await remove(ref(database, getStudentPath("seances")));
      await remove(ref(database, getStudentPath("seances_todos")));
      state.db = [];
      state.sessionDateTodos = {};

      if (render) render();

      return {
        succes: true,
        message: "L'emploi du temps a été intégralement réinitialisé.",
      };
    }

    // ============================================================
    // --- PILIER ADMIN SÉCURISÉ (RÉSERVÉ EXCLUSIVEMENT ADMIN) ---
    // ============================================================
    case "approuver_demande_compte": {
      if (!isAdmin) throw new Error("🚫 Commande réservée aux Administrateurs.");
      const { email_ou_nom } = toolArgs;
      const query = (email_ou_nom || "").toLowerCase().trim();

      const snap = await get(ref(database, "users"));
      let targetUid = null;
      let targetUser = null;

      if (snap.exists()) {
        snap.forEach((child) => {
          const u = child.val();
          if (
            (u.email && u.email.toLowerCase().includes(query)) ||
            (u.displayName && u.displayName.toLowerCase().includes(query)) ||
            child.key === query
          ) {
            targetUid = child.key;
            targetUser = u;
          }
        });
      }

      if (!targetUid) throw new Error(`Aucun utilisateur trouvé correspondant à "${email_ou_nom}".`);

      await update(ref(database, `users/${targetUid}`), { status: "approved" });
      await loadAdminKPIs();

      return {
        succes: true,
        message: `Compte de ${targetUser.displayName || targetUser.email} validé avec succès.`,
      };
    }

    case "refuser_ou_supprimer_compte": {
      if (!isAdmin) throw new Error("🚫 Commande réservée aux Administrateurs.");
      const { user_uid_ou_email } = toolArgs;
      const query = (user_uid_ou_email || "").toLowerCase().trim();

      const snap = await get(ref(database, "users"));
      let targetUid = null;
      let targetUser = null;

      if (snap.exists()) {
        snap.forEach((child) => {
          const u = child.val();
          if (
            (u.email && u.email.toLowerCase().includes(query)) ||
            (u.displayName && u.displayName.toLowerCase().includes(query)) ||
            child.key === query
          ) {
            targetUid = child.key;
            targetUser = u;
          }
        });
      }

      if (!targetUid) throw new Error(`Compte introuvable pour "${user_uid_ou_email}".`);

      await remove(ref(database, `users/${targetUid}`));
      await remove(ref(database, `student_data/${targetUid}`));
      if (targetUser.parentLinkCode) {
        await remove(ref(database, `parent_codes/${targetUser.parentLinkCode}`));
      }
      await loadAdminKPIs();

      return {
        succes: true,
        message: `Compte de ${targetUser.displayName || targetUser.email} supprimé.`,
      };
    }

    case "activer_option_ia_compte": {
      if (!isAdmin) throw new Error("🚫 Commande réservée aux Administrateurs.");
      const { user_uid_ou_email, statut } = toolArgs;
      const query = (user_uid_ou_email || "").toLowerCase().trim();

      const snap = await get(ref(database, "users"));
      let targetUid = null;
      let targetUser = null;

      if (snap.exists()) {
        snap.forEach((child) => {
          const u = child.val();
          if (
            (u.email && u.email.toLowerCase().includes(query)) ||
            (u.displayName && u.displayName.toLowerCase().includes(query)) ||
            child.key === query
          ) {
            targetUid = child.key;
            targetUser = u;
          }
        });
      }

      if (!targetUid) throw new Error(`Compte introuvable pour "${user_uid_ou_email}".`);

      await update(ref(database, `users/${targetUid}`), { tutorAiEnabled: Boolean(statut) });
      await loadAdminKPIs();

      return {
        succes: true,
        message: `Option IA de ${targetUser.displayName || targetUser.email} ${statut ? "activée" : "désactivée"}.`,
      };
    }

    case "publier_annonce_globale": {
      if (!isAdmin) throw new Error("🚫 Commande réservée aux Administrateurs.");
      const { titre, contenu } = toolArgs;
      const newId = Date.now().toString();

      const annObj = {
        id: newId,
        title: titre,
        content: contenu,
        date: new Date().toLocaleDateString("fr-FR"),
        author: profile.displayName || "Admin",
      };

      await set(ref(database, `system_config/announcements/${newId}`), annObj);

      return {
        succes: true,
        message: `Annonce "${titre}" publiée avec succès.`,
      };
    }

    case "inspecter_planning_eleve": {
      if (!isAdmin) throw new Error("🚫 Commande réservée aux Administrateurs.");
      const { student_uid_ou_nom } = toolArgs;
      const query = (student_uid_ou_nom || "").toLowerCase().trim();

      const snap = await get(ref(database, "users"));
      let targetUid = null;
      let targetUser = null;

      if (snap.exists()) {
        snap.forEach((child) => {
          const u = child.val();
          if (
            (u.email && u.email.toLowerCase().includes(query)) ||
            (u.displayName && u.displayName.toLowerCase().includes(query)) ||
            child.key === query
          ) {
            targetUid = child.key;
            targetUser = u;
          }
        });
      }

      if (!targetUid) throw new Error(`Élève introuvable pour "${student_uid_ou_nom}".`);

      if (window.inspectStudentByAdmin) {
        await window.inspectStudentByAdmin(targetUid);
      }

      return {
        succes: true,
        message: `Supervision active pour : ${targetUser.displayName || targetUser.email}.`,
      };
    }

    default:
      throw new Error(`Outil non reconnu : "${toolName}".`);
  }
}

// ============================================================
// 5. ORCHESTRATEUR VOCAL & EXÉCUTION DIRECTE
// ============================================================
export async function executeJarvisCommand(userText) {
  const cleanInput = cleanDuplicateWords((userText || "").trim());
  if (!cleanInput) {
    alert("Veuillez d'abord prononcer ou saisir une commande.");
    return;
  }

  showLoading("Exécution intelligente de votre commande...");
  const feedbackBox = document.getElementById("aiFeedbackBox");

  const apiKey = getAiApiKey();
  const modelName = getAiModelName();
  const profile = state.currentUserProfile || {};
  const isAdmin = profile.role === "admin";

  let finalAssistantMessage = "";

  try {
    if (apiKey) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const systemInstruction = buildJarvisLiveContext();

      // Séparation stricte des outils : Seul l'Admin a accès aux outils d'administration
      const activeTools = isAdmin
        ? STUDENT_TOOLS_DECLARATIONS.concat(ADMIN_TOOLS_DECLARATIONS)
        : STUDENT_TOOLS_DECLARATIONS;

      const requestBody = {
        contents: [
          {
            role: "user",
            parts: [{ text: cleanInput }],
          },
        ],
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        tools: [
          {
            function_declarations: activeTools,
          },
        ],
        generationConfig: {
          temperature: 0.1,
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Gemini API HTTP Error ${response.status}`);
      }

      const resData = await response.json();
      const candidate = resData.candidates?.[0]?.content;
      const parts = candidate?.parts || [];

      // Détection functionCall
      const functionCallPart = parts.find((p) => p.functionCall);

      if (functionCallPart) {
        const call = functionCallPart.functionCall;
        const callArgs = call.args || {};

        try {
          const toolResult = await executeJarvisToolCall(call.name, callArgs);
          finalAssistantMessage = toolResult.message || `Action exécutée avec succès.`;
        } catch (execErr) {
          finalAssistantMessage = `⚠️ ${execErr.message}`;
        }
      } else {
        finalAssistantMessage = parts.map((p) => p.text || "").join(" ").trim();
      }
    } else {
      finalAssistantMessage = await fallbackLocalAiHandler(cleanInput);
    }
  } catch (err) {
    console.warn("Fallback IA local suite à exception API:", err);
    finalAssistantMessage = await fallbackLocalAiHandler(cleanInput);
  }

  hideLoading();

  // Affichage du résultat dans le HUD sans badge admin pour les élèves
  if (feedbackBox) {
    feedbackBox.style.display = "block";
    feedbackBox.style.background = "#0f172a";
    feedbackBox.style.color = "#f8fafc";
    feedbackBox.style.border = "1.5px solid #38bdf8";
    feedbackBox.style.boxShadow = "0 8px 24px rgba(56, 189, 248, 0.25)";

    const headerTitle = isAdmin ? "🛡️ JARVIS Copilote Admin" : "🎙️ Assistant IA Baccalauréat";

    feedbackBox.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(56,189,248,0.3); padding-bottom:6px;">
          <span style="font-size:13.5px; font-weight:800; color:#38bdf8; display:flex; align-items:center; gap:6px;">
            ${headerTitle}
          </span>
          <button type="button" id="btnJarvisAudioToggle" onclick="window.toggleJarvisSpeechMute()" style="background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid #38bdf8; padding:3px 8px; border-radius:6px; font-size:11px; cursor:pointer; font-weight:700;">
            ${isJarvisAudioMuted ? "🔇 Voix Coupée" : "🔊 Voix Active"}
          </button>
        </div>
        <div style="font-size:13px; line-height:1.5; color:#e2e8f0;">
          ${formatResponseText(finalAssistantMessage)}
        </div>
      </div>
    `;
  }

  // Synthèse vocale de la confirmation
  speakJarvisResponse(finalAssistantMessage);

  return finalAssistantMessage;
}

// Fallback heuristique local infaillible
async function fallbackLocalAiHandler(text) {
  const low = text.toLowerCase();

  // 1. Consultation du planning
  if (low.includes("qu'est-ce que j'ai") || low.includes("programme") || low.includes("planning") || low.includes("3andi")) {
    const res = await executeJarvisToolCall("consulter_planning_jour", {
      jour: low.includes("demain") || low.includes("ghodwa") ? "demain" : "aujourd'hui",
    });
    if (res.total_seances === 0) return `Vous n'avez aucune séance planifiée pour ${res.jour} (${res.date}).`;
    return (
      `Programme de ${res.jour} : vous avez ${res.total_seances} séance(s) :\n` +
      res.programme.map((s) => `- ${s.matiere} (${s.debut} - ${s.fin}) [${s.type}]${s.travail ? ` (Devoir: ${s.travail})` : ""}`).join("\n")
    );
  }

  // 2. Minuteur
  if (low.includes("minuteur") || low.includes("chrono") || low.includes("pomodoro")) {
    const mMatch = low.match(/(\d{1,3})\s*(?:min|minute)/i);
    const mins = mMatch ? parseInt(mMatch[1], 10) : 25;
    const res = await executeJarvisToolCall("regler_minuteur", { minutes: mins, demarrer_immediatement: true });
    return res.message;
  }

  // 3. Détection intelligente de séance avec heure exacte
  const timeInfo = extractTimeRangeFromText(text);
  const cleanTodo = extractCleanTodo(text);

  let subject = "Étude / Révision";
  if (/math|mathematique|رياضيات|مات|alg|analyse/i.test(low)) subject = "Mathématiques";
  else if (/phys|physique|chimie|فيزياء|فيزيك/i.test(low)) subject = "Sciences Physiques";
  else if (/svt|science|3ouloum|علوم|bio/i.test(low)) subject = "Sciences SVT";
  else if (/info|informatique|tic|algo|python|sql|اعلامية/i.test(low)) subject = "Informatique";
  else if (/philo|philosophie|falsafa|فلسفة/i.test(low)) subject = "Philosophie";
  else if (/arabe|3arbi|عربية|نصوص/i.test(low)) subject = "Arabe";
  else if (/franc|french|فرنسية/i.test(low)) subject = "Français";
  else if (/angl|english|انقليزية/i.test(low)) subject = "Anglais";
  else if (/eco|gestion|اقتصاد/i.test(low)) subject = "Économie & Gestion";
  else if (/histoire|geo|hg|تاريخ/i.test(low)) subject = "Histoire-Géo";
  else if (/sport|eps|رياضة/i.test(low)) subject = "Sport";

  const isPart = /particulier|etude|étude|dar el prof|chez prof|برتيكولي/i.test(low);

  try {
    const res = await executeJarvisToolCall("ajouter_seance", {
      matiere: subject,
      jour: low.includes("ghodwa") || low.includes("demain") ? "Demain" : "Aujourd'hui",
      heure_debut: timeInfo.startStr,
      heure_fin: timeInfo.endStr,
      type_lieu: isPart ? "Particulier" : "À la maison",
      travail_a_faire: cleanTodo,
    });
    return res.message;
  } catch (e) {
    return `Instruction reçue : "${text}". Connectez votre clé API Google Gemini dans les paramètres ⚙️ pour une compréhension totale illimitée.`;
  }
}

function formatResponseText(txt) {
  if (!txt) return "";
  return txt
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.*?)\*/g, "<i>$1</i>");
}

// Bindings globaux
window.executeJarvisCommand = executeJarvisCommand;
window.toggleJarvisSpeechMute = toggleJarvisSpeechMute;
