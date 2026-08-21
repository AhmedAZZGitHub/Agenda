// js/jarvis-engine.js
// 🤖 Moteur IA « JARVIS Suprême » - Copilote Vocal & Textuel d'Élite
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
  const btn = document.getElementById("btnJarvisAudioToggle");
  if (btn) {
    btn.innerHTML = isJarvisAudioMuted ? "🔇 Voix Coupée" : "🔊 Voix Active";
    btn.classList.toggle("muted", isJarvisAudioMuted);
  }
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
    const frVoice = voices.find((v) => v.lang.startsWith("fr") && (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Thomas") || v.name.includes("Henri") || v.name.includes("Julie")));
    if (frVoice) utterance.voice = frVoice;

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Synthèse vocale Jarvis non disponible:", err);
  }
}

// ============================================================
// 1. DÉCLARATION COMPLÈTE DES OUTILS (GEMINI FUNCTION CALLING)
// ============================================================
export const JARVIS_TOOLS_DECLARATIONS = [
  // --- PILIER 1 : EMPLOI DU TEMPS & GESTION QUOTIDIENNE ---
  {
    name: "ajouter_seance",
    description: "Ajoute une nouvelle séance ou cours au planning de l'élève avec matière, horaire, lieu/modalité, répétition et travail à faire.",
    parameters: {
      type: "OBJECT",
      properties: {
        matiere: {
          type: "STRING",
          description: "Nom officiel de la matière (Mathématiques, Sciences Physiques, Sciences SVT, Informatique, Philosophie, Arabe, Français, Anglais, Économie & Gestion, Histoire-Géo, Sport, Option)",
        },
        jour: {
          type: "STRING",
          description: "Jour de la semaine ('Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche') ou index 0 à 6.",
        },
        heure_debut: {
          type: "STRING",
          description: "Heure de début au format HH:MM (ex: '14:00', '09:30', '16:00').",
        },
        heure_fin: {
          type: "STRING",
          description: "Heure de fin au format HH:MM (ex: '16:00', '11:30', '18:00'). Si non spécifié, prévoir début + 2h.",
        },
        type_lieu: {
          type: "STRING",
          enum: ["À la maison", "En ligne", "Lycée", "Particulier"],
          description: "Type ou modalité du cours.",
        },
        frequence: {
          type: "STRING",
          enum: ["Chaque semaine", "Par quinzaine", "Ce jour seulement"],
          description: "Fréquence de répétition de la séance.",
        },
        date_specifique: {
          type: "STRING",
          description: "Date exacte au format YYYY-MM-DD si la séance est ponctuelle ou pour une date précise.",
        },
        travail_a_faire: {
          type: "STRING",
          description: "Exercices, série de devoirs, chapitre ou projet à préparer pour cette séance (ex: 'Série 3 analyse exercices 1 et 4').",
        },
      },
      required: ["matiere", "jour", "heure_debut"],
    },
  },
  {
    name: "consulter_planning_jour",
    description: "Consulte et analyse les séances et le travail à faire pour un jour donné (par exemple 'aujourd'hui', 'demain', 'samedi') et produit un récapitulatif oral et textuel complet.",
    parameters: {
      type: "OBJECT",
      properties: {
        jour: {
          type: "STRING",
          description: "Nom du jour recherché ('Aujourd'hui', 'Demain', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche') ou index 0-6.",
        },
        date: {
          type: "STRING",
          description: "Date précise au format YYYY-MM-DD si applicable.",
        },
      },
    },
  },
  {
    name: "modifier_devoir_seance",
    description: "Met à jour ou ajoute le travail à faire / devoirs d'une séance spécifique ou coche les exercices comme terminés.",
    parameters: {
      type: "OBJECT",
      properties: {
        seance_id: {
          type: "STRING",
          description: "Identifiant de la séance ou nom de la matière.",
        },
        nouveau_travail: {
          type: "STRING",
          description: "Texte actualisé du travail à faire ou exercices à préparer.",
        },
        est_fait: {
          type: "BOOLEAN",
          description: "Indique si le travail à faire est complété/terminé.",
        },
      },
      required: ["seance_id"],
    },
  },
  {
    name: "programmer_examen",
    description: "Planifie un examen, devoir de contrôle (DC), devoir de synthèse (DS) ou examen blanc.",
    parameters: {
      type: "OBJECT",
      properties: {
        matiere: {
          type: "STRING",
          description: "Matière de l'examen (Mathématiques, Physique, etc.).",
        },
        type_examen: {
          type: "STRING",
          enum: ["Devoir de Contrôle (DC)", "Devoir de Synthèse (DS)", "Examen Blanc"],
          description: "Type d'épreuve.",
        },
        date: {
          type: "STRING",
          description: "Date de l'examen au format YYYY-MM-DD.",
        },
        programme: {
          type: "STRING",
          description: "Chapitres, notions ou programme au menu de l'examen.",
        },
      },
      required: ["matiere", "date"],
    },
  },
  {
    name: "regler_minuteur",
    description: "Règle et lance un minuteur de travail ou de révision (Pomodoro / session d'étude).",
    parameters: {
      type: "OBJECT",
      properties: {
        heures: {
          type: "NUMBER",
          description: "Nombre d'heures du minuteur (0 à 12).",
        },
        minutes: {
          type: "NUMBER",
          description: "Nombre de minutes du minuteur (1 à 59).",
        },
        demarrer_immediatement: {
          type: "BOOLEAN",
          description: "Démarrer immédiatement le compte à rebours.",
        },
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
        seance_id: {
          type: "STRING",
          description: "ID de la séance à supprimer ou nom de la matière.",
        },
        matiere: {
          type: "STRING",
          description: "Nom de la matière pour recherche contextuelle.",
        },
        jour: {
          type: "STRING",
          description: "Jour de la séance à supprimer.",
        },
      },
    },
  },
  {
    name: "vider_planning",
    description: "Vide intégralement l'emploi du temps de l'élève actuel (efface toutes les séances).",
    parameters: {
      type: "OBJECT",
      properties: {
        confirmation: {
          type: "BOOLEAN",
          description: "Confirmation explicite de l'effacement total.",
        },
      },
    },
  },

  // --- PILIER 3 : SUPERVISION & CONTRÔLE GLOBAL ADMIN (RÉSERVÉ ROLE === 'admin') ---
  {
    name: "approuver_demande_compte",
    description: "Valide et active une demande de compte en attente dans la base de données. RÉSERVÉ STRICTEMENT AUX ADMINISTRATEURS.",
    parameters: {
      type: "OBJECT",
      properties: {
        email_ou_nom: {
          type: "STRING",
          description: "Adresse email ou nom de la personne dont la demande doit être validée.",
        },
      },
      required: ["email_ou_nom"],
    },
  },
  {
    name: "refuser_ou_supprimer_compte",
    description: "Refuse une demande en attente ou supprime définitivement un compte utilisateur et ses données. RÉSERVÉ STRICTEMENT AUX ADMINISTRATEURS.",
    parameters: {
      type: "OBJECT",
      properties: {
        user_uid_ou_email: {
          type: "STRING",
          description: "UID ou adresse email du compte à supprimer.",
        },
      },
      required: ["user_uid_ou_email"],
    },
  },
  {
    name: "activer_option_ia_compte",
    description: "Active ou désactive l'accès aux fonctionnalités d'Intelligence Artificielle pour un compte élève donné. RÉSERVÉ STRICTEMENT AUX ADMINISTRATEURS.",
    parameters: {
      type: "OBJECT",
      properties: {
        user_uid_ou_email: {
          type: "STRING",
          description: "UID ou adresse email de l'élève.",
        },
        statut: {
          type: "BOOLEAN",
          description: "true pour activer l'accès IA, false pour le restreindre.",
        },
      },
      required: ["user_uid_ou_email", "statut"],
    },
  },
  {
    name: "publier_annonce_globale",
    description: "Diffuse une annonce générale visible par tous les utilisateurs connectés sur leur tableau de bord. RÉSERVÉ STRICTEMENT AUX ADMINISTRATEURS.",
    parameters: {
      type: "OBJECT",
      properties: {
        titre: {
          type: "STRING",
          description: "Titre percutant de l'annonce.",
        },
        contenu: {
          type: "STRING",
          description: "Corps du message officiel.",
        },
      },
      required: ["titre", "contenu"],
    },
  },
  {
    name: "inspecter_planning_eleve",
    description: "Bascule la vue superviseur sur l'emploi du temps d'un élève spécifique pour l'analyser. RÉSERVÉ STRICTEMENT AUX ADMINISTRATEURS.",
    parameters: {
      type: "OBJECT",
      properties: {
        student_uid_ou_nom: {
          type: "STRING",
          description: "UID ou nom de l'élève à superviser.",
        },
      },
      required: ["student_uid_ou_nom"],
    },
  },
];

// ============================================================
// 2. CONTEXTE LIVE DYNAMIQUE INJECTÉ DANS GEMINI
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

  // Récupération des séances d'aujourd'hui
  const dateKey = getSessionDateKey(dayIdx);
  const todaySessions = (state.db || [])
    .filter((s) => s.day === dayIdx)
    .sort((a, b) => a.s - b.s)
    .map((s) => {
      const todoKey = `${s.id}_${dateKey}`;
      const todoObj = state.sessionDateTodos && state.sessionDateTodos[todoKey];
      const todoTxt = todoObj && todoObj.todo ? ` (Travail: ${todoObj.todo} [${todoObj.todoDone ? "Fait" : "À faire"}])` : "";
      return `- ${s.sub} de ${formatM(s.s)} à ${formatM(s.e)} [${s.type || "Lycée"}]${todoTxt}`;
    });

  const todaySummary = todaySessions.length > 0
    ? `Séances prévues aujourd'hui (${currentDayName} ${todayIso}) :\n${todaySessions.join("\n")}`
    : `Aucune séance planifiée pour aujourd'hui (${currentDayName} ${todayIso}).`;

  // Examens à venir
  const upcomingExams = (state.examsDb || [])
    .filter((ex) => ex.date >= todayIso)
    .slice(0, 3)
    .map((ex) => `- ${ex.type || "Examen"} en ${ex.sub} prévu le ${ex.date} (${ex.desc || "Sans détail"})`);

  const examsSummary = upcomingExams.length > 0
    ? `Examens à venir :\n${upcomingExams.join("\n")}`
    : "Aucun examen imminent enregistré.";

  // Contexte Admin si applicable
  let adminContext = "";
  if (isAdmin && state.allUsersCache && state.allUsersCache.length > 0) {
    const pendingList = state.allUsersCache.filter((u) => u.status === "pending");
    adminContext = `\n[CONTEXTE ADMIN ACTIVE]
- Demandes en attente de validation (${pendingList.length}) : ${pendingList.map((u) => `${u.displayName} (${u.email}, ${u.section || "Bac"})`).join(", ") || "Aucune"}
- Total comptes actifs : ${state.allUsersCache.length}`;
  }

  return `Tu es "JARVIS Suprême", le Copilote IA Vocal & Textuel d'élite et tuteur personnel suprême du Baccalauréat tunisien (toutes sections : Math, Sciences, Info, Éco-Gestion, Technique, Lettres, Sport).
Tu disposes des PLEINS POUVOIRS sur l'application grâce à ton Function Calling (Tools).

INFORMATIONS TEMPS RÉEL :
- Date & Heure actuelles : ${currentDayName} ${todayIso} à ${currentTime}.
- Utilisateur connecté : ${userName} (Email: ${profile.email || "Non défini"}).
- Rôle actif : "${userRole.toUpperCase()}" | Section : ${userSection}.
- Privilèges Administrateur : ${isAdmin ? "OUI (Accès total débloqué)" : "NON (Utilisateur standard)"}.

${todaySummary}
${examsSummary}${adminContext}

RÈGLES D'OR DE COMPORTEMENT :
1. MULTILINGUISME NATUREL TOTAL : Tu comprends parfaitement et réponds avec aisance en Français, en Arabe littéraire et en dialecte Tunisien (Derja en lettres arabes ou arabizi : 3=ع, 7=ح, 9=ق, 5=خ, 2=ء).
2. AUCUNE SYNTAXE OU FORMULE RIGIDE : Tu comprends le langage naturel libre, spontané, les phrases abrégées ou orales. Tu déduis intelligemment les matières, jours, heures et intentions sans jamais contraindre l'utilisateur.
3. CONTRÔLE D'ACCÈS ADMIN STRICT : Les outils d'administration (approuver_demande_compte, refuser_ou_supprimer_compte, activer_option_ia_compte, publier_annonce_globale, inspecter_planning_eleve) sont STRICTEMENT RÉSERVÉS AUX ADMINISTRATEURS. Si un élève ou parent tente de les exécuter, refuse poliment mais fermement.
4. TUTEUR DE HAUT NIVEAU : Si l'utilisateur pose une question de cours, de méthodologie ou d'exercice (notamment la méthodologie officielle en Arabe, les algorithmes Python, la physique ou les maths), réponds avec une rigueur pédagogique exemplaire.
5. VOCATION ORALE : Sois concis, dynamique, élégant et charismatique (style JARVIS).`;
}

// ============================================================
// 3. EXÉCUTION DES OUTILS (ROUTEUR LOCAL & FIREBASE DATABASE)
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
      let dayIdx = 0;
      if (typeof jour === "number") dayIdx = Math.max(0, Math.min(6, jour));
      else if (typeof jour === "string") {
        const jLow = jour.toLowerCase();
        if (jLow.includes("lun") || jLow.includes("thnin")) dayIdx = 0;
        else if (jLow.includes("mar") || jLow.includes("tlet")) dayIdx = 1;
        else if (jLow.includes("mer") || jLow.includes("arba")) dayIdx = 2;
        else if (jLow.includes("jeu") || jLow.includes("khmi")) dayIdx = 3;
        else if (jLow.includes("ven") || jLow.includes("jem") || jLow.includes("jom")) dayIdx = 4;
        else if (jLow.includes("sam") || jLow.includes("seb")) dayIdx = 5;
        else if (jLow.includes("dim") || jLow.includes("a7ad") || jLow.includes("ahad")) dayIdx = 6;
        else if (jLow.includes("demain") || jLow.includes("ghodwa")) dayIdx = (new Date().getDay() + 6 + 1) % 7;
        else if (jLow.includes("aujourd") || jLow.includes("lyoum")) dayIdx = (new Date().getDay() + 6) % 7;
      }

      // Conversion des horaires en minutes depuis minuit
      function parseTimeToMinutes(tStr, defaultMin) {
        if (!tStr) return defaultMin;
        if (typeof tStr === "number") return tStr * 60;
        const match = tStr.match(/(\d{1,2})[h:]?(\d{2})?/i);
        if (match) {
          const h = parseInt(match[1], 10);
          const m = match[2] ? parseInt(match[2], 10) : 0;
          return h * 60 + m;
        }
        return defaultMin;
      }

      const sMin = parseTimeToMinutes(heure_debut, 14 * 60);
      const eMin = parseTimeToMinutes(heure_fin, sMin + 120);

      const targetDateKey = date_specifique || getSessionDateKey(dayIdx);
      const newId = Date.now().toString() + Math.floor(Math.random() * 1000);

      const sessionObj = {
        id: newId,
        sub: matiere || "Mathématiques",
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

      // Ajout du travail à faire si précisé
      if (travail_a_faire && travail_a_faire.trim()) {
        const todoKey = `${newId}_${targetDateKey}`;
        const todoObj = {
          todo: cleanDuplicateWords(travail_a_faire.trim()),
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
      return {
        succes: true,
        message: `Séance de ${matiere} ajoutée avec succès pour le ${dayNames[dayIdx]} de ${formatM(sMin)} à ${formatM(eMin)} (${type_lieu || "À la maison"})${travail_a_faire ? ` avec travail : "${travail_a_faire}"` : ""}.`,
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

    // --- 3. MODIFIER DEVOIRS D'UNE SÉANCE ---
    case "modifier_devoir_seance": {
      if (state.isReadOnly) throw new Error("Accès en lecture seule.");
      const { seance_id, nouveau_travail, est_fait } = toolArgs;

      let targetSession = (state.db || []).find((s) => s.id === seance_id);
      if (!targetSession && typeof seance_id === "string") {
        targetSession = (state.db || []).find((s) => s.sub.toLowerCase().includes(seance_id.toLowerCase()));
      }

      if (!targetSession) {
        throw new Error(`Séance non trouvée pour "${seance_id}".`);
      }

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
        message: `Travail à faire pour la séance de ${targetSession.sub} mis à jour : "${updatedTodo.todo}" (${updatedTodo.todoDone ? "✅ Fait" : "⏳ À faire"}).`,
      };
    }

    // --- 4. PROGRAMMER UN EXAMEN ---
    case "programmer_examen": {
      if (state.isReadOnly) throw new Error("Accès en lecture seule.");
      const { matiere, type_examen, date, programme } = toolArgs;
      const newId = Date.now().toString();

      const examObj = {
        id: newId,
        sub: matiere || "Mathématiques",
        type: type_examen || "Devoir de Contrôle (DC)",
        date: date || new Date().toISOString().split("T")[0],
        desc: programme || "Planifié par JARVIS Suprême",
      };

      await set(ref(database, getStudentPath("examens/" + newId)), examObj);
      if (!state.examsDb) state.examsDb = [];
      state.examsDb.push(examObj);

      if (render) render();

      return {
        succes: true,
        message: `${examObj.type} de ${examObj.sub} programmé avec succès pour le ${examObj.date}.`,
        examen: examObj,
      };
    }

    // --- 5. RÉGLER ET LANCER LE MINUTEUR ---
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
        message: `Minuteur de concentration réglé sur ${h > 0 ? h + "h " : ""}${m} minutes et lancé.`,
      };
    }

    // --- 6. SUPPRIMER UNE SÉANCE ---
    case "supprimer_seance": {
      if (state.isReadOnly) throw new Error("Accès en lecture seule.");
      const { seance_id, matiere, jour } = toolArgs;

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
        message: `Séance de ${found.sub} (${formatM(found.s)} - ${formatM(found.e)}) supprimée du planning.`,
      };
    }

    // --- 7. VIDER LE PLANNING ---
    case "vider_planning": {
      if (state.isReadOnly) throw new Error("Accès en lecture seule.");
      await remove(ref(database, getStudentPath("seances")));
      await remove(ref(database, getStudentPath("seances_todos")));
      state.db = [];
      state.sessionDateTodos = {};

      if (render) render();

      return {
        succes: true,
        message: "L'emploi du temps a été intégralement vidé.",
      };
    }

    // ============================================================
    // --- PILIER 3 : SUPERVISION & CONTRÔLE GLOBAL ADMIN ---
    // ============================================================
    case "approuver_demande_compte": {
      if (!isAdmin) {
        throw new Error("🚫 Accès Refusé : Cette commande est strictement réservée aux Administrateurs.");
      }
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

      if (!targetUid) {
        throw new Error(`Aucun utilisateur trouvé correspondant à "${email_ou_nom}".`);
      }

      await update(ref(database, `users/${targetUid}`), { status: "approved" });
      await loadAdminKPIs();

      return {
        succes: true,
        message: `Compte de ${targetUser.displayName || targetUser.email} (${targetUser.email}) validé avec succès. L'utilisateur peut désormais se connecter !`,
      };
    }

    case "refuser_ou_supprimer_compte": {
      if (!isAdmin) {
        throw new Error("🚫 Accès Refusé : Cette commande est strictement réservée aux Administrateurs.");
      }
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

      if (!targetUid) {
        throw new Error(`Utilisateur introuvable pour "${user_uid_ou_email}".`);
      }

      await remove(ref(database, `users/${targetUid}`));
      await remove(ref(database, `student_data/${targetUid}`));
      if (targetUser.parentLinkCode) {
        await remove(ref(database, `parent_codes/${targetUser.parentLinkCode}`));
      }
      await loadAdminKPIs();

      return {
        succes: true,
        message: `Compte de ${targetUser.displayName || targetUser.email} et l'ensemble de ses données ont été supprimés avec succès.`,
      };
    }

    case "activer_option_ia_compte": {
      if (!isAdmin) {
        throw new Error("🚫 Accès Refusé : Cette commande est strictement réservée aux Administrateurs.");
      }
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
        message: `Accès IA pour ${targetUser.displayName || targetUser.email} ${statut ? "activé ✅" : "désactivé 🔒"}.`,
      };
    }

    case "publier_annonce_globale": {
      if (!isAdmin) {
        throw new Error("🚫 Accès Refusé : Cette commande est strictement réservée aux Administrateurs.");
      }
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
        message: `Annonce globale "${titre}" diffusée avec succès à tous les utilisateurs.`,
      };
    }

    case "inspecter_planning_eleve": {
      if (!isAdmin) {
        throw new Error("🚫 Accès Refusé : Cette commande est strictement réservée aux Administrateurs.");
      }
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
        message: `Vous supervisez désormais en direct l'emploi du temps de : ${targetUser.displayName || targetUser.email}.`,
      };
    }

    default:
      throw new Error(`Outil inconnu : "${toolName}".`);
  }
}

// ============================================================
// 4. MOTEUR D'ORCHESTRATION JARVIS SUPRÊME
// ============================================================
export async function executeJarvisCommand(userText) {
  const cleanInput = cleanDuplicateWords((userText || "").trim());
  if (!cleanInput) {
    alert("Veuillez d'abord prononcer ou saisir une commande.");
    return;
  }

  showLoading("JARVIS Suprême analyse votre commande...");
  const feedbackBox = document.getElementById("aiFeedbackBox");

  const apiKey = getAiApiKey();
  const modelName = getAiModelName();

  let executedToolName = null;
  let toolResult = null;
  let finalAssistantMessage = "";

  try {
    if (apiKey) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const systemInstruction = buildJarvisLiveContext();

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
            function_declarations: JARVIS_TOOLS_DECLARATIONS,
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
      };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Gemini API Error ${response.status}`);
      }

      const resData = await response.json();
      const candidate = resData.candidates?.[0]?.content;
      const parts = candidate?.parts || [];

      // Détection functionCall
      const functionCallPart = parts.find((p) => p.functionCall);

      if (functionCallPart) {
        const call = functionCallPart.functionCall;
        executedToolName = call.name;
        const callArgs = call.args || {};

        try {
          toolResult = await executeJarvisToolCall(call.name, callArgs);
          finalAssistantMessage = toolResult.message || `Action "${call.name}" exécutée avec succès.`;
        } catch (execErr) {
          finalAssistantMessage = `⚠️ ${execErr.message}`;
        }
      } else {
        finalAssistantMessage = parts.map((p) => p.text || "").join(" ").trim();
      }
    } else {
      finalAssistantMessage = await fallbackLocalJarvisHandler(cleanInput);
    }
  } catch (err) {
    console.warn("Jarvis Gemini calling fallback:", err);
    finalAssistantMessage = await fallbackLocalJarvisHandler(cleanInput);
  }

  hideLoading();

  if (feedbackBox) {
    feedbackBox.style.display = "block";
    feedbackBox.style.background = "#0f172a";
    feedbackBox.style.color = "#f8fafc";
    feedbackBox.style.border = "1.5px solid #38bdf8";
    feedbackBox.style.boxShadow = "0 8px 24px rgba(56, 189, 248, 0.25)";

    feedbackBox.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(56,189,248,0.3); padding-bottom:6px;">
          <span style="font-size:13.5px; font-weight:800; color:#38bdf8; display:flex; align-items:center; gap:6px;">
            🤖 JARVIS Suprême
          </span>
          <button type="button" id="btnJarvisAudioToggle" onclick="window.toggleJarvisSpeechMute()" style="background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid #38bdf8; padding:3px 8px; border-radius:6px; font-size:11px; cursor:pointer; font-weight:700;">
            ${isJarvisAudioMuted ? "🔇 Voix Coupée" : "🔊 Voix Active"}
          </button>
        </div>
        <div style="font-size:13px; line-height:1.5; color:#e2e8f0;">
          ${formatJarvisResponseText(finalAssistantMessage)}
        </div>
      </div>
    `;
  }

  speakJarvisResponse(finalAssistantMessage);

  return finalAssistantMessage;
}

// Fallback heuristique local
async function fallbackLocalJarvisHandler(text) {
  const low = text.toLowerCase();

  if (low.includes("qu'est-ce que j'ai") || low.includes("programme") || low.includes("planning") || low.includes("3andi")) {
    const res = await executeJarvisToolCall("consulter_planning_jour", { jour: "aujourd'hui" });
    if (res.total_seances === 0) return `Vous n'avez aucun cours planifié pour ${res.jour} (${res.date}). Profitez-en pour réviser !`;
    return `Programme de ${res.jour} : vous avez ${res.total_seances} séance(s) :\n` + res.programme.map((s) => `- ${s.matiere} (${s.debut} - ${s.fin}) [${s.type}]${s.travail ? ` - Devoir: ${s.travail}` : ""}`).join("\n");
  }

  if (low.includes("minuteur") || low.includes("chrono") || low.includes("pomodoro")) {
    const mMatch = low.match(/(\d{1,3})\s*(?:min|minute)/i);
    const mins = mMatch ? parseInt(mMatch[1], 10) : 25;
    const res = await executeJarvisToolCall("regler_minuteur", { minutes: mins, demarrer_immediatement: true });
    return res.message;
  }

  try {
    const res = await executeJarvisToolCall("ajouter_seance", {
      matiere: low.includes("phys") ? "Sciences Physiques" : low.includes("svt") ? "Sciences SVT" : low.includes("info") ? "Informatique" : "Mathématiques",
      jour: low.includes("ghodwa") || low.includes("demain") ? "Demain" : "Aujourd'hui",
      heure_debut: "14:00",
      heure_fin: "16:00",
      travail_a_faire: text,
    });
    return res.message;
  } catch (e) {
    return `J'ai bien reçu votre consigne : "${text}". Pour une compréhension optimale avec Tool Calling illimité, connectez votre clé API Google Gemini dans les paramètres ⚙️.`;
  }
}

function formatJarvisResponseText(txt) {
  if (!txt) return "";
  return txt
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.*?)\*/g, "<i>$1</i>");
}

// Enregistrement des fonctions dans window
window.executeJarvisCommand = executeJarvisCommand;
window.toggleJarvisSpeechMute = toggleJarvisSpeechMute;
