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
import "./admin.js";

// Gestion de l'état d'authentification Firebase
onAuthStateChanged(auth, async (user) => {
  if (user) {
    state.currentUser = user;
    await loadUserProfile(user.uid);
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

    const nameEl = document.getElementById("userNameLabel");
    const roleBadge = document.getElementById("userRoleBadge");
    const avatarEl = document.getElementById("userAvatarIco");
    const btnParent = document.getElementById("btnMyParentCode");
    const pCtrl = document.getElementById("parentChildControls");
    const btnAdmin = document.getElementById("btnAdminConsole");
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
    if (btnProf) btnProf.style.display = "none";

    updateReadOnlyUI();
    render();
    window.showAuthModal();
  }
});

// Initialisation globale au chargement du DOM
document.addEventListener("DOMContentLoaded", () => {
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
  render();
});
