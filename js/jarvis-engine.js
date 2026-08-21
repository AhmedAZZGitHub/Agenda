// js/jarvis-engine.js
// 🤖 Moteur Vocal 100% Direct Google Gemini (gemini-2.5-flash) avec Function Calling & Firebase
// Aucune règle locale ou regex : toute la compréhension est déléguée directement à l'Intelligence Artificielle

import { database, auth, ref, set, get, remove, update } from "./firebase-config.js?v=18.1";
import { state, getStudentPath, showLoading, hideLoading, formatM } from "./state.js?v=18.1";
import { getSessionDateKey, render, openTimer, setTimerPreset, toggleTimer } from "./calendar.js?v=18.1";
import { loadAdminKPIs } from "./admin.js?v=18.1";
import { getAiModelName, getAiApiKey } from "./ai-assistant.js?v=18.1";

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
// 1. SCHÉMA D'OUTILS DIRECTS (FUNCTION CALLING GEMINI)
// ============================================================

export const STUDENT_TOOLS_DECLARATIONS = [
  {
    name: "ajouter_seance",
    description: "Ajoute une séance au planning avec la matière, le jour, l'heure exacte et les devoirs.",
    parameters: {
      type: "OBJECT",
      properties: {
        matiere: {
          type: "STRING",
          description: "Nom de la matière (Mathématiques, Sciences Physiques, Sciences SVT, Informatique, Philosophie, Arabe, Français, Anglais, Économie & Gestion, Histoire-Géo, Sport, Option, Étude / Révision). Si non précisée, mettre 'Étude / Révision'.",
        },
        jour: {
          type: "STRING",
          description: "Jour de la séance ('Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche', 'Aujourd'hui', 'Demain').",
        },
        heure_debut: {
          type: "STRING",
          description: "Heure de début EXACTE au format HH:MM (ex: '08:00', '09:00', '10:30', '14:00', '16:00'). Si l'utilisateur dit 8h, heure_debut vaut '08:00'.",
        },
        heure_fin: {
          type: "STRING",
          description: "Heure de fin EXACTE au format HH:MM (ex: '10:00', '12:00', '16:00', '18:00'). Si l'utilisateur dit '8h 10h', heure_fin vaut '10:00'. Si non précisée, calculer heure_debut + 2h.",
        },
        type_lieu: {
          type: "STRING",
          enum: ["À la maison", "En ligne", "Lycée", "Particulier"],
          description: "Type de séance ('À la maison', 'Particulier', 'Lycée' ou 'En ligne').",
        },
        frequence: {
          type: "STRING",
          enum: ["Chaque semaine", "Par quinzaine", "Ce jour seulement"],
          description: "Répétition de la séance.",
        },
        date_specifique: {
          type: "STRING",
          description: "Date exacte YYYY-MM-DD si séance ponctuelle.",
        },
        travail_a_faire: {
          type: "STRING",
          description: "STRICTEMENT ET UNIQUEMENT les exercices ou devoirs à faire (ex: 'Série 3 analyse', 'Exercices 1 et 2'). Doit valoir null si aucun travail n'est mentionné. NE JAMAIS METTRE LA COMMANDE D'AJOUT.",
        },
      },
      required: ["matiere", "jour", "heure_debut"],
    },
  },
  {
    name: "consulter_planning_jour",
    description: "Consulte le planning des cours et devoirs d'un jour donné (aujourd'hui, demain, samedi...).",
    parameters: {
      type: "OBJECT",
      properties: {
        jour: {
          type: "STRING",
          description: "Jour ('Aujourd'hui', 'Demain', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche').",
        },
      },
    },
  },
  {
    name: "modifier_devoir_seance",
    description: "Met à jour ou valide les devoirs d'une séance.",
    parameters: {
      type: "OBJECT",
      properties: {
        seance_id_ou_matiere: {
          type: "STRING",
          description: "Nom de la matière ou ID de la séance.",
        },
        nouveau_travail: {
          type: "STRING",
          description: "Nouveaux devoirs / exercices à faire.",
        },
        est_fait: {
          type: "BOOLEAN",
          description: "true si terminé, false sinon.",
        },
      },
      required: ["seance_id_ou_matiere"],
    },
  },
  {
    name: "programmer_examen",
    description: "Planifie un examen (DC, DS, Examen Blanc).",
    parameters: {
      type: "OBJECT",
      properties: {
        matiere: { type: "STRING", description: "Matière de l'épreuve." },
        type_examen: {
          type: "STRING",
          enum: ["Devoir de Contrôle (DC)", "Devoir de Synthèse (DS)", "Examen Blanc"],
          description: "Type de l'examen.",
        },
        date: { type: "STRING", description: "Date de l'examen au format YYYY-MM-DD." },
        programme: { type: "STRING", description: "Programme ou notions au menu." },
      },
      required: ["matiere", "date"],
    },
  },
  {
    name: "regler_minuteur",
    description: "Règle et démarre un minuteur de travail ou révision.",
    parameters: {
      type: "OBJECT",
      properties: {
        heures: { type: "NUMBER", description: "Nombre d'heures (0 si moins d'une heure)." },
        minutes: { type: "NUMBER", description: "Nombre de minutes." },
        demarrer_immediatement: { type: "BOOLEAN", description: "Lancer le décompte immédiatement." },
      },
      required: ["minutes"],
    },
  },
  {
    name: "supprimer_seance",
    description: "Supprime une séance du planning par matière ou jour.",
    parameters: {
      type: "OBJECT",
      properties: {
        matiere: { type: "STRING", description: "Nom de la matière à supprimer." },
        jour: { type: "STRING", description: "Jour de la séance." },
      },
      required: ["matiere"],
    },
  },
  {
    name: "vider_planning",
    description: "Réinitialise complètement l'emploi du temps de l'élève.",
    parameters: {
      type: "OBJECT",
      properties: {
        confirmation: { type: "BOOLEAN", description: "Confirmation explicite." },
      },
    },
  },
];

// Outils exclusifs administrateur
export const ADMIN_TOOLS_DECLARATIONS = [
  {
    name: "approuver_demande_compte",
    description: "Valide une demande d'inscription en attente. STRICTEMENT RÉSERVÉ ADMIN.",
    parameters: {
      type: "OBJECT",
      properties: {
        email_ou_nom: { type: "STRING", description: "Email ou nom de la personne à valider." },
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
        user_uid_ou_email: { type: "STRING", description: "UID ou email du compte à supprimer." },
      },
      required: ["user_uid_ou_email"],
    },
  },
  {
    name: "activer_option_ia_compte",
    description: "Active ou désactive l'IA pour un compte. STRICTEMENT RÉSERVÉ ADMIN.",
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
    description: "Publie une annonce visible par tous les élèves. STRICTEMENT RÉSERVÉ ADMIN.",
    parameters: {
      type: "OBJECT",
      properties: {
        titre: { type: "STRING", description: "Titre de l'annonce." },
        contenu: { type: "STRING", description: "Texte de l'annonce." },
      },
      required: ["titre", "contenu"],
    },
  },
  {
    name: "inspecter_planning_eleve",
    description: "Supervise le tableau de bord d'un élève. STRICTEMENT RÉSERVÉ ADMIN.",
    parameters: {
      type: "OBJECT",
      properties: {
        student_uid_ou_nom: { type: "STRING", description: "UID ou nom de l'élève." },
      },
      required: ["student_uid_ou_nom"],
    },
  },
];

// Conversion directe string "HH:MM" en minutes
function timeStringToMinutes(str, defaultMin = 8 * 60) {
  if (!str) return defaultMin;
  const match = String(str).match(/(\d{1,2})[h:]?(\d{2})?/i);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = match[2] ? parseInt(match[2], 10) : 0;
    return h * 60 + m;
  }
  return defaultMin;
}

function dayStringToIndex(dayStr) {
  const now = new Date();
  let todayIdx = (now.getDay() + 6) % 7; // 0=Lundi, 6=Dimanche
  if (!dayStr) return todayIdx;

  const low = String(dayStr).toLowerCase();
  if (low.includes("demain") || low.includes("ghodwa")) return (todayIdx + 1) % 7;
  if (low.includes("apres") || low.includes("après") || low.includes("ba3d")) return (todayIdx + 2) % 7;
  if (low.includes("lun") || low.includes("thnin")) return 0;
  if (low.includes("mar") || low.includes("tlet")) return 1;
  if (low.includes("mer") || low.includes("arba")) return 2;
  if (low.includes("jeu") || low.includes("khmi")) return 3;
  if (low.includes("ven") || low.includes("jem") || low.includes("jom")) return 4;
  if (low.includes("sam") || low.includes("seb")) return 5;
  if (low.includes("dim") || low.includes("a7ad")) return 6;
  return todayIdx;
}

// ============================================================
// 2. EXÉCUTION DU FUNCTION CALLING DIRECT
// ============================================================
export async function executeJarvisToolCall(toolName, toolArgs) {
  const profile = state.currentUserProfile || {};
  const isAdmin = profile.role === "admin";

  switch (toolName) {
    // 1. AJOUTER UNE SÉANCE
    case "ajouter_seance": {
      if (state.isReadOnly) throw new Error("Accès en lecture seule.");
      const { matiere, jour, heure_debut, heure_fin, type_lieu, frequence, date_specifique, travail_a_faire } = toolArgs;

      const dayIdx = dayStringToIndex(jour);
      const sMin = timeStringToMinutes(heure_debut, 8 * 60);
      const eMin = timeStringToMinutes(heure_fin, sMin + 120);

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

      // Devoirs (seulement si fourni)
      let todoMsg = "";
      if (travail_a_faire && typeof travail_a_faire === "string" && travail_a_faire.trim().length > 1) {
        const cleanTodo = travail_a_faire.trim();
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
        todoMsg = ` avec travail à faire : "${cleanTodo}"`;
      }

      if (render) render();

      const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
      const timeFmt = `${formatM(sMin)} à ${formatM(eMin)}`;
      return {
        succes: true,
        message: `Séance de ${finalSubject} ajoutée pour ${dayNames[dayIdx]} de ${timeFmt} (${sessionObj.type})${todoMsg}.`,
      };
    }

    // 2. CONSULTER PLANNING
    case "consulter_planning_jour": {
      const { jour } = toolArgs;
      const targetDayIdx = dayStringToIndex(jour);
      const dayNames = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
      const targetDateKey = getSessionDateKey(targetDayIdx);

      const sessions = (state.db || [])
        .filter((s) => s.day === targetDayIdx)
        .sort((a, b) => a.s - b.s);

      if (!sessions.length) {
        return {
          succes: true,
          message: `Vous n'avez aucun cours planifié pour ${dayNames[targetDayIdx]} (${targetDateKey}).`,
        };
      }

      const listStr = sessions
        .map((s) => {
          const todoKey = `${s.id}_${targetDateKey}`;
          const todoObj = state.sessionDateTodos && state.sessionDateTodos[todoKey];
          const todoTxt = todoObj && todoObj.todo ? ` (Devoir: ${todoObj.todo})` : "";
          return `- ${s.sub} de ${formatM(s.s)} à ${formatM(s.e)} [${s.type}]${todoTxt}`;
        })
        .join("\n");

      return {
        succes: true,
        message: `Programme de ${dayNames[targetDayIdx]} (${sessions.length} séance(s)) :\n${listStr}`,
      };
    }

    // 3. MODIFIER DEVOIRS
    case "modifier_devoir_seance": {
      if (state.isReadOnly) throw new Error("Accès en lecture seule.");
      const { seance_id_ou_matiere, nouveau_travail, est_fait } = toolArgs;

      const q = String(seance_id_ou_matiere || "").toLowerCase();
      let targetSession = (state.db || []).find((s) => s.id === q || s.sub.toLowerCase().includes(q));

      if (!targetSession) throw new Error(`Séance introuvable pour "${seance_id_ou_matiere}".`);

      const dateKey = getSessionDateKey(targetSession.day);
      const todoKey = `${targetSession.id}_${dateKey}`;
      const existing = (state.sessionDateTodos && state.sessionDateTodos[todoKey]) || {};

      const updated = {
        todo: nouveau_travail ? nouveau_travail.trim() : existing.todo || "Devoirs",
        todoDone: typeof est_fait === "boolean" ? est_fait : existing.todoDone || false,
        date: dateKey,
        sessionId: targetSession.id,
      };

      await set(ref(database, getStudentPath(`seances_todos/${todoKey}`)), updated);
      if (!state.sessionDateTodos) state.sessionDateTodos = {};
      state.sessionDateTodos[todoKey] = updated;

      if (render) render();

      return {
        succes: true,
        message: `Devoir pour ${targetSession.sub} mis à jour : "${updated.todo}" (${updated.todoDone ? "Fait" : "À faire"}).`,
      };
    }

    // 4. PROGRAMMER EXAMEN
    case "programmer_examen": {
      if (state.isReadOnly) throw new Error("Accès en lecture seule.");
      const { matiere, type_examen, date, programme } = toolArgs;
      const newId = Date.now().toString();

      const examObj = {
        id: newId,
        sub: matiere || "Mathématiques",
        type: type_examen || "Devoir de Contrôle (DC)",
        date: date || new Date().toISOString().split("T")[0],
        desc: programme || "Planifié vocalement",
      };

      await set(ref(database, getStudentPath("examens/" + newId)), examObj);
      if (!state.examsDb) state.examsDb = [];
      state.examsDb.push(examObj);

      if (render) render();

      return {
        succes: true,
        message: `${examObj.type} de ${examObj.sub} planifié pour le ${examObj.date}.`,
      };
    }

    // 5. RÉGLER MINUTEUR
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

    // 6. SUPPRIMER SÉANCE
    case "supprimer_seance": {
      if (state.isReadOnly) throw new Error("Accès en lecture seule.");
      const { matiere } = toolArgs;
      const q = String(matiere || "").toLowerCase();

      const found = (state.db || []).find((s) => s.sub.toLowerCase().includes(q));
      if (!found) throw new Error(`Séance de "${matiere}" introuvable.`);

      await remove(ref(database, getStudentPath("seances/" + found.id)));
      state.db = state.db.filter((s) => s.id !== found.id);

      if (render) render();

      return {
        succes: true,
        message: `Séance de ${found.sub} supprimée.`,
      };
    }

    // 7. VIDER PLANNING
    case "vider_planning": {
      if (state.isReadOnly) throw new Error("Accès en lecture seule.");
      await remove(ref(database, getStudentPath("seances")));
      await remove(ref(database, getStudentPath("seances_todos")));
      state.db = [];
      state.sessionDateTodos = {};

      if (render) render();

      return {
        succes: true,
        message: "L'emploi du temps a été entièrement vidé.",
      };
    }

    // ============================================================
    // --- ACTIONS ADMINISTRATEUR STRICTES ---
    // ============================================================
    case "approuver_demande_compte": {
      if (!isAdmin) throw new Error("🚫 Accès Refusé : Réservé aux Administrateurs.");
      const query = String(toolArgs.email_ou_nom || "").toLowerCase().trim();
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

      if (!targetUid) throw new Error(`Aucune demande trouvée pour "${toolArgs.email_ou_nom}".`);

      await update(ref(database, `users/${targetUid}`), { status: "approved" });
      await loadAdminKPIs();

      return {
        succes: true,
        message: `Compte de ${targetUser.displayName || targetUser.email} validé avec succès.`,
      };
    }

    case "refuser_ou_supprimer_compte": {
      if (!isAdmin) throw new Error("🚫 Accès Refusé : Réservé aux Administrateurs.");
      const query = String(toolArgs.user_uid_ou_email || "").toLowerCase().trim();
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

      if (!targetUid) throw new Error(`Compte introuvable pour "${toolArgs.user_uid_ou_email}".`);

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
      if (!isAdmin) throw new Error("🚫 Accès Refusé : Réservé aux Administrateurs.");
      const query = String(toolArgs.user_uid_ou_email || "").toLowerCase().trim();
      const snap = await get(ref(database, "users"));
      let targetUid = null;

      if (snap.exists()) {
        snap.forEach((child) => {
          const u = child.val();
          if (
            (u.email && u.email.toLowerCase().includes(query)) ||
            (u.displayName && u.displayName.toLowerCase().includes(query)) ||
            child.key === query
          ) {
            targetUid = child.key;
          }
        });
      }

      if (!targetUid) throw new Error(`Utilisateur introuvable.`);
      await update(ref(database, `users/${targetUid}`), { tutorAiEnabled: Boolean(toolArgs.statut) });
      await loadAdminKPIs();

      return {
        succes: true,
        message: `Option IA mise à jour (${toolArgs.statut ? "Activée" : "Désactivée"}).`,
      };
    }

    case "publier_annonce_globale": {
      if (!isAdmin) throw new Error("🚫 Accès Refusé : Réservé aux Administrateurs.");
      const newId = Date.now().toString();
      await set(ref(database, `system_config/announcements/${newId}`), {
        id: newId,
        title: toolArgs.titre,
        content: toolArgs.contenu,
        date: new Date().toLocaleDateString("fr-FR"),
        author: profile.displayName || "Admin",
      });
      return {
        succes: true,
        message: `Annonce "${toolArgs.titre}" publiée.`,
      };
    }

    case "inspecter_planning_eleve": {
      if (!isAdmin) throw new Error("🚫 Accès Refusé : Réservé aux Administrateurs.");
      const query = String(toolArgs.student_uid_ou_nom || "").toLowerCase().trim();
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

      if (!targetUid) throw new Error(`Élève introuvable.`);
      if (window.inspectStudentByAdmin) {
        await window.inspectStudentByAdmin(targetUid);
      }

      return {
        succes: true,
        message: `Supervision active pour : ${targetUser.displayName || targetUser.email}.`,
      };
    }

    default:
      throw new Error(`Action inconnue : "${toolName}".`);
  }
}

// ============================================================
// 3. ENVOI DIRECT DU TEXTE BRUT À GEMINI SANS PARSING LOCAL
// ============================================================
export async function executeJarvisCommand(rawUserText) {
  const text = (rawUserText || "").trim();
  if (!text) {
    alert("Veuillez d'abord prononcer ou saisir une commande.");
    return;
  }

  showLoading("Gemini analyse directement votre demande...");
  const feedbackBox = document.getElementById("aiFeedbackBox");

  const apiKey = getAiApiKey();
  const modelName = getAiModelName();
  const profile = state.currentUserProfile || {};
  const isAdmin = profile.role === "admin";

  let finalAssistantMessage = "";

  try {
    if (!apiKey) {
      hideLoading();
      window.openAiSettingsModal();
      return "Veuillez renseigner votre clé API Google Gemini dans les paramètres.";
    }

    const now = new Date();
    const dayNames = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    const currentDayName = dayNames[now.getDay()];
    const todayIso = now.toISOString().split("T")[0];
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    // Prompt système direct exigé
    const systemInstruction = `Tu es un assistant de planification d'élite et tuteur personnel du Baccalauréat tunisien.
Date actuelle : ${currentDayName} ${todayIso} à ${currentTime}.
Utilisateur : ${profile.displayName || profile.email || "Élève"} (${profile.role || "student"}).

Ton rôle est de comprendre la demande brute de l'utilisateur (même avec des hésitations, des répétitions ou en mélangeant français et dialecte tunisien) et d'extraire avec une précision chirurgicale les arguments exacts pour l'action demandée.

RÈGLES STRICTES :
1. HORAIRES EXACTS : Si l'utilisateur dit '8h 10h' ou 'de 8h à 10h', heure_debut = '08:00' et heure_fin = '10:00'. Si l'utilisateur dit '14h 16h', heure_debut = '14:00' et heure_fin = '16:00'. Ne mets jamais 14:00 par défaut quand une heure a été dictée.
2. TRAVAIL À FAIRE (TODO) : Le champ devoir/todo ne doit contenir STRICTEMENT que le travail/exercice demandé (ex: 'Série 3 analyse'), et JAMAIS la phrase de commande elle-même. Si aucun travail n'est mentionné, mets impérativement null.
3. MATIÈRE : Si aucune matière n'est mentionnée (ex: 'ajoute une séance demain 8h 10h'), choisis 'Étude / Révision'.
4. VOCATION ORALE : Sois concis, naturel et encourageant.`;

    const activeTools = isAdmin
      ? STUDENT_TOOLS_DECLARATIONS.concat(ADMIN_TOOLS_DECLARATIONS)
      : STUDENT_TOOLS_DECLARATIONS;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: text }],
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
      throw new Error(`Erreur API Gemini (${response.status})`);
    }

    const resData = await response.json();
    const candidate = resData.candidates?.[0]?.content;
    const parts = candidate?.parts || [];

    const functionCallPart = parts.find((p) => p.functionCall);

    if (functionCallPart) {
      const call = functionCallPart.functionCall;
      const callArgs = call.args || {};

      try {
        const result = await executeJarvisToolCall(call.name, callArgs);
        finalAssistantMessage = result.message || "Action exécutée avec succès.";
      } catch (err) {
        finalAssistantMessage = `⚠️ ${err.message}`;
      }
    } else {
      finalAssistantMessage = parts.map((p) => p.text || "").join(" ").trim();
    }
  } catch (err) {
    console.error("Erreur direct Gemini:", err);
    finalAssistantMessage = `⚠️ Erreur : ${err.message}`;
  }

  hideLoading();

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
          ${finalAssistantMessage.replace(/\n/g, "<br>")}
        </div>
      </div>
    `;
  }

  // Confirmation vocale automatique
  speakJarvisResponse(finalAssistantMessage);

  return finalAssistantMessage;
}

// Bindings globaux
window.executeJarvisCommand = executeJarvisCommand;
window.toggleJarvisSpeechMute = toggleJarvisSpeechMute;
