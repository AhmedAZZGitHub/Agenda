// js/app.js
// Point d'Entrée Principal de l'Application

import { auth, onAuthStateChanged } from "./firebase-config.js";
import { state } from "./state.js";
import { loadUserProfile, detachAllDataListeners, renderUserProfileBar, updateReadOnlyUI } from "./auth.js";
import { render, updateBacCountdown, updateHomeStreak } from "./calendar.js";
import { initBacArchiveTabs, switchTrimester } from "./grades.js";

// Import modules to register window bindings
import "./maps.js";
import "./ai-assistant.js";
import "./jarvis-engine.js";
import "./admin.js";
import "./tutor-ai.js";
import { initNotificationsSystem } from "./notifications.js";

// Initialisation par défaut du modèle officiel Google Gemini 3.6 Flash
try {
  const curM = localStorage.getItem("gemini_model_name");
  if (!curM || curM === "gemini-2.5-flash" || curM.includes("2.5-flash")) {
    localStorage.setItem("gemini_model_name", "gemini-3.6-flash");
  }
} catch (e) {}

// Gestion de l'état d'authentification Firebase
onAuthStateChanged(auth, async (user) => {
  const authOverlay = document.getElementById("authOverlay");
  const mainApp = document.getElementById("mainAppWrap");
  const authBtn = document.getElementById("authActionBtn");

  if (user) {
    state.currentUser = user;
    state.activeStudentUid = user.uid; // Compte actif par défaut dès l'ouverture
    if (authOverlay) authOverlay.style.display = "none";
    if (mainApp) mainApp.style.display = "flex";
    if (authBtn) {
      authBtn.innerText = "🚪 Déconnexion";
      authBtn.style.color = "#ef4444";
      authBtn.onclick = window.handleLogout;
    }
    await loadUserProfile(user.uid);
    initNotificationsSystem();
  } else {
    state.currentUser = null;
    state.currentUserProfile = null;
    state.activeStudentUid = null;
    state.activeStudentProfile = null;
    state.isReadOnly = false;
    detachAllDataListeners();
    state.db = [];
    state.examsDb = [];
    state.userGrades = {};
    state.bacArchiveData = {};

    if (authOverlay) authOverlay.style.display = "flex";
    if (mainApp) mainApp.style.display = "none";
    if (authBtn) {
      authBtn.innerText = "🔑 Connexion";
      authBtn.style.color = "var(--primary)";
      authBtn.onclick = window.showAuthModal;
    }

    const nameEl = document.getElementById("userNameLabel");
    const roleBadge = document.getElementById("userRoleBadge");
    const avatarEl = document.getElementById("userAvatarIco");
    const btnParent = document.getElementById("btnMyParentCode");
    const pCtrl = document.getElementById("parentChildControls");
    const btnAdmin = document.getElementById("btnAdminConsole");
    const btnJarvis = document.getElementById("btnJarvisAdmin");
    const btnProf = document.getElementById("btnMyProfile");

    if (nameEl) nameEl.innerText = "Non connecté";
    if (roleBadge) {
      roleBadge.className = "role-badge role-student";
      roleBadge.innerText = "INVITÉ";
    }
    if (avatarEl) avatarEl.innerText = "👤";
    if (btnParent) btnParent.style.display = "none";
    if (pCtrl) pCtrl.style.display = "none";
    if (btnAdmin) btnAdmin.style.display = "none";
    if (btnJarvis) btnJarvis.style.display = "inline-flex";
    if (btnProf) btnProf.style.display = "none";

    updateReadOnlyUI();
    render();
  }
});

// Initialisation globale au chargement du DOM
document.addEventListener("DOMContentLoaded", () => {
  // Enregistrement proactif du Service Worker PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        console.log("PWA Service Worker actif:", reg.scope);
      })
      .catch((err) => {
        console.warn("Erreur enregistrement Service Worker:", err);
      });
  }

  // Thème sombre
  const savedDark = localStorage.getItem("app_dark_mode");
  if (savedDark === "true") {
    document.body.classList.add("dark-mode");
    const btn = document.getElementById("btnToggleDark");
    if (btn) btn.innerText = "☀️ Mode Clair";
  }

  // Initialisations
  initBacArchiveTabs();
  switchTrimester("trim1");
  updateBacCountdown();
  setInterval(updateBacCountdown, 60000);
  initNotificationsSystem();
  render();
});
