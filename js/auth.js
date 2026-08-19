// js/auth.js
// Gestion de l'Authentification, des Rôles (Élève / Parent / Admin), Profil et Liaison Parent-Élève

import {
  auth,
  database,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  updatePassword,
  sendPasswordResetEmail,
  ref,
  set,
  get,
  onValue,
  off,
} from "./firebase-config.js?v=15.4";
import { state, getStudentPath, showLoading, hideLoading } from "./state.js?v=15.4";
import { loadAdminKPIs, listenToAnnouncements } from "./admin.js?v=15.4";
import { render } from "./calendar.js?v=15.4";
import { switchTrimester, selectBacSubject } from "./grades.js?v=15.4";

export function showAuthModal() {
  const el = document.getElementById("authOverlay");
  if (el) el.style.display = "flex";
  switchAuthTab("login");
}

export function switchAuthTab(tab) {
  const errDiv = document.getElementById("authErrorMsg");
  const successDiv = document.getElementById("authSuccessMsg");
  if (errDiv) errDiv.style.display = "none";
  if (successDiv && tab !== "login") successDiv.style.display = "none";

  const tabLogin = document.getElementById("tabLoginBtn");
  const tabReg = document.getElementById("tabRegisterBtn");

  if (tabLogin) tabLogin.classList.toggle("active", tab === "login");
  if (tabReg) tabReg.classList.toggle("active", tab === "register");

  const loginForm = document.getElementById("loginForm");
  const regForm = document.getElementById("registerForm");

  if (loginForm) loginForm.style.display = tab === "login" ? "flex" : "none";
  if (regForm) regForm.style.display = tab === "register" ? "flex" : "none";
}

export function selectRole(role) {
  state.selectedRegRole = role;
  const optStudent = document.getElementById("roleOpt_student");
  const optParent = document.getElementById("roleOpt_parent");
  const optAdmin = document.getElementById("roleOpt_admin");
  const secGroup = document.getElementById("regSectionGroup");

  if (optStudent) optStudent.classList.toggle("active", role === "student");
  if (optParent) optParent.classList.toggle("active", role === "parent");
  if (optAdmin) optAdmin.classList.toggle("active", role === "admin");
  if (secGroup) secGroup.style.display = role === "student" ? "block" : "none";
}

export async function handleLogin(e) {
  e.preventDefault();
  const emailInp = document.getElementById("loginEmail");
  const passInp = document.getElementById("loginPassword");
  const email = emailInp ? emailInp.value.trim() : "";
  const pass = passInp ? passInp.value : "";
  const errDiv = document.getElementById("authErrorMsg");
  const successDiv = document.getElementById("authSuccessMsg");

  if (errDiv) errDiv.style.display = "none";
  if (successDiv) successDiv.style.display = "none";

  if (!email || !pass) {
    if (errDiv) {
      errDiv.innerText = "Veuillez saisir votre adresse email et votre mot de passe.";
      errDiv.style.display = "block";
    }
    return;
  }

  try {
    showLoading("Connexion en cours...");
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    hideLoading();
    if (errDiv) {
      errDiv.innerText = formatAuthError(err.code || err.message);
      errDiv.style.display = "block";
    }
  }
}

export async function handleRegister(e) {
  e.preventDefault();
  const nameInp = document.getElementById("regName");
  const emailInp = document.getElementById("regEmail");
  const passInp = document.getElementById("regPassword");
  const secInp = document.getElementById("regSection");

  const name = nameInp ? nameInp.value.trim() : "";
  const email = emailInp ? emailInp.value.trim() : "";
  const pass = passInp ? passInp.value : "";
  const section = secInp ? secInp.value : "Mathematiques";

  const errDiv = document.getElementById("authErrorMsg");
  const successDiv = document.getElementById("authSuccessMsg");
  if (errDiv) errDiv.style.display = "none";
  if (successDiv) successDiv.style.display = "none";

  try {
    showLoading("Création de votre compte...");
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    const user = userCredential.user;
    const uid = user.uid;

    await updateProfile(user, { displayName: name });

    const isAutoApproved = email.toLowerCase().includes("admin") || uid === "admin_preconfig";
    const parentCode = state.selectedRegRole === "student" ? "BAC-" + Math.random().toString(36).substring(2, 6).toUpperCase() : null;

    const profileData = {
      uid: uid,
      email: email,
      displayName: name,
      role: state.selectedRegRole,
      status: isAutoApproved ? "approved" : "pending",
      section: state.selectedRegRole === "student" ? section : null,
      parentLinkCode: parentCode || null,
      linkedStudents: state.selectedRegRole === "parent" ? [] : null,
      createdAt: Date.now(),
    };

    await set(ref(database, `users/${uid}`), profileData);
    if (parentCode) {
      await set(ref(database, `parent_codes/${parentCode}`), uid);
    }
    hideLoading();

    if (!isAutoApproved) {
      await signOut(auth);
      if (successDiv) {
        successDiv.innerHTML = `🎉 <b>Demande enregistrée avec succès !</b><br>Votre compte a été créé. Vous pouvez vous connecter dès que l'administrateur valide votre accès.`;
        successDiv.style.display = "block";
      }
      switchAuthTab("login");
    }
  } catch (err) {
    hideLoading();
    if (errDiv) {
      errDiv.innerText = formatAuthError(err.code || err.message);
      errDiv.style.display = "block";
    }
  }
}

export async function handleLogout() {
  window.showStyledConfirm(
    "Déconnexion",
    "Voulez-vous vraiment vous déconnecter de votre compte ?",
    "🚪",
    async () => {
      detachAllDataListeners();
      await signOut(auth);
    }
  );
}

export function formatAuthError(code = "") {
  if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential"))
    return "Identifiants invalides ou mot de passe incorrect.";
  if (code.includes("email-already-in-use")) return "Cette adresse email est déjà enregistrée. Veuillez vous connecter.";
  if (code.includes("weak-password")) return "Le mot de passe doit contenir au moins 6 caractères.";
  return "Erreur : " + code;
}

export async function loadUserProfile(uid) {
  try {
    showLoading("Chargement de votre profil...");
    let userSnap = null;
    try {
      userSnap = await get(ref(database, `users/${uid}`));
    } catch (dbErr) {
      console.warn("Erreur lecture Firebase Database profil:", dbErr);
    }

    if (!userSnap || !userSnap.exists()) {
      state.currentUserProfile = {
        uid: uid,
        email: state.currentUser?.email || "",
        displayName: state.currentUser?.displayName || state.currentUser?.email?.split("@")[0] || "Élève",
        role: "student",
        status: "approved",
        parentLinkCode: "BAC-" + Math.random().toString(36).substring(2, 6).toUpperCase(),
        createdAt: Date.now(),
      };
      try {
        await set(ref(database, `users/${uid}`), state.currentUserProfile);
        await set(ref(database, `parent_codes/${state.currentUserProfile.parentLinkCode}`), uid);
      } catch (e) {}
    } else {
      state.currentUserProfile = userSnap.val() || {};
      if (!state.currentUserProfile.status) {
        state.currentUserProfile.status = "approved";
      }
      if (!state.currentUserProfile.role) {
        state.currentUserProfile.role = "student";
      }
    }

    // Vérification du statut en attente
    if (state.currentUserProfile.status === "pending") {
      await signOut(auth);
      hideLoading();
      const errDiv = document.getElementById("authErrorMsg");
      if (errDiv) {
        errDiv.innerHTML = "⏳ <b>Compte en attente</b> : Votre inscription doit être validée par l'administrateur.";
        errDiv.style.display = "block";
      }
      const authOverlay = document.getElementById("authOverlay");
      const mainApp = document.getElementById("mainAppWrap");
      if (authOverlay) authOverlay.style.display = "flex";
      if (mainApp) mainApp.style.display = "none";
      return;
    }

    if (state.currentUserProfile.status === "rejected") {
      await signOut(auth);
      hideLoading();
      const errDiv = document.getElementById("authErrorMsg");
      if (errDiv) {
        errDiv.innerHTML = "❌ <b>Accès refusé</b> : Cette demande a été refusée par l'administrateur.";
        errDiv.style.display = "block";
      }
      const authOverlay = document.getElementById("authOverlay");
      const mainApp = document.getElementById("mainAppWrap");
      if (authOverlay) authOverlay.style.display = "flex";
      if (mainApp) mainApp.style.display = "none";
      return;
    }

    renderUserProfileBar();

    if (state.currentUserProfile.role === "student") {
      state.activeStudentUid = uid;
      state.activeStudentProfile = state.currentUserProfile;
      state.isReadOnly = false;
      updateReadOnlyUI();
      attachStudentDataListeners(uid);
    } else if (state.currentUserProfile.role === "parent") {
      state.isReadOnly = true;
      updateReadOnlyUI();
      await setupParentDashboard();
    } else if (state.currentUserProfile.role === "admin") {
      state.activeStudentUid = uid;
      state.activeStudentProfile = state.currentUserProfile;
      state.isReadOnly = false;
      updateReadOnlyUI();
      attachStudentDataListeners(uid);
      loadAdminKPIs();
    }

    try {
      listenToAnnouncements();
    } catch (e) {}
    try {
      render();
    } catch (e) {}

    const authOverlay = document.getElementById("authOverlay");
    const mainApp = document.getElementById("mainAppWrap");
    if (authOverlay) authOverlay.style.display = "none";
    if (mainApp) mainApp.style.display = "flex";
  } catch (e) {
    console.error("Erreur chargement profil:", e);
  } finally {
    const authOverlay = document.getElementById("authOverlay");
    const mainApp = document.getElementById("mainAppWrap");
    if (state.currentUser && state.currentUserProfile && state.currentUserProfile.status !== "pending" && state.currentUserProfile.status !== "rejected") {
      if (authOverlay) authOverlay.style.display = "none";
      if (mainApp) mainApp.style.display = "flex";
    }
    hideLoading();
  }
}

export function renderUserProfileBar() {
  const nameEl = document.getElementById("userNameLabel");
  const roleBadge = document.getElementById("userRoleBadge");
  const avatarEl = document.getElementById("userAvatarIco");

  if (nameEl) nameEl.innerText = state.currentUserProfile.displayName || state.currentUserProfile.email;
  if (roleBadge) roleBadge.className = `role-badge role-${state.currentUserProfile.role}`;

  const roleLabels = {
    student: `🎓 Élève (${state.currentUserProfile.section || "Maths"})`,
    parent: "👨‍👩‍👧 Parent d'élève",
    admin: "🛡️ Administrateur",
  };
  if (roleBadge) roleBadge.innerText = roleLabels[state.currentUserProfile.role] || "UTILISATEUR";

  const firstLetter = (state.currentUserProfile.displayName || "U")[0].toUpperCase();
  if (avatarEl) avatarEl.innerText = firstLetter;

  const btnParent = document.getElementById("btnMyParentCode");
  const pCtrl = document.getElementById("parentChildControls");
  const btnAdmin = document.getElementById("btnAdminConsole");
  const btnProf = document.getElementById("btnMyProfile");

  if (btnParent) btnParent.style.display = state.currentUserProfile.role === "student" || state.currentUserProfile.role === "admin" ? "inline-flex" : "none";
  if (pCtrl) pCtrl.style.display = state.currentUserProfile.role === "parent" ? "inline-flex" : "none";
  if (btnAdmin) btnAdmin.style.display = state.currentUserProfile.role === "admin" ? "inline-flex" : "none";
  if (btnProf) btnProf.style.display = "inline-flex";

  const pCodeDisp = document.getElementById("myParentCodeDisplay");
  if (pCodeDisp && state.currentUserProfile.parentLinkCode) {
    pCodeDisp.innerText = state.currentUserProfile.parentLinkCode;
  }

  const fabTutor = document.getElementById("btnOpenTutorFab");
  if (fabTutor) {
    const isTutorActive = state.currentUserProfile.role === "admin" || state.currentUserProfile.tutorAiEnabled !== false;
    fabTutor.style.display = isTutorActive ? "flex" : "none";
  }
}

export function openUserProfileModal() {
  if (!state.currentUser || !state.currentUserProfile) {
    showAuthModal();
    return;
  }

  const hName = document.getElementById("profHeaderName");
  const hEmail = document.getElementById("profHeaderEmail");
  const uidCode = document.getElementById("profUidCode");

  if (hName) hName.innerText = state.currentUserProfile.displayName || state.currentUser.email;
  if (hEmail) hEmail.innerText = state.currentUser.email;
  if (uidCode) uidCode.innerText = state.currentUser.uid;

  const roleBadges = {
    student: { label: "ÉLÈVE", cls: "role-student", ico: "🎓" },
    parent: { label: "PARENT", cls: "role-parent", ico: "👨‍👩‍👧" },
    admin: { label: "ADMIN", cls: "role-admin", ico: "🛡️" },
  };
  const rInfo = roleBadges[state.currentUserProfile.role] || { label: "UTILISATEUR", cls: "role-student", ico: "👤" };
  const roleBadge = document.getElementById("profRoleBadge");
  const avatarCir = document.getElementById("profAvatarCircle");

  if (roleBadge) {
    roleBadge.className = `role-badge ${rInfo.cls}`;
    roleBadge.innerText = rInfo.label;
  }
  if (avatarCir) avatarCir.innerText = rInfo.ico;

  const d = state.currentUserProfile.createdAt ? new Date(state.currentUserProfile.createdAt) : null;
  const cDateEl = document.getElementById("profCreatedDate");
  if (cDateEl) {
    cDateEl.innerText = d
      ? d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "Récemment";
  }

  if (!state.currentUserProfile.parentLinkCode && (state.currentUserProfile.role === "student" || state.currentUserProfile.role === "admin")) {
    state.currentUserProfile.parentLinkCode = "BAC-" + Math.random().toString(36).substring(2, 6).toUpperCase();
    set(ref(database, `users/${state.currentUser.uid}/parentLinkCode`), state.currentUserProfile.parentLinkCode);
    set(ref(database, `parent_codes/${state.currentUserProfile.parentLinkCode}`), state.currentUser.uid);
  }

  const pCodeRow = document.getElementById("profParentCodeRow");
  const pCodeVal = document.getElementById("profParentCodeVal");
  if (pCodeRow) {
    if (state.currentUserProfile.parentLinkCode) {
      pCodeRow.style.display = "flex";
      if (pCodeVal) pCodeVal.innerText = state.currentUserProfile.parentLinkCode;
    } else {
      pCodeRow.style.display = "none";
    }
  }

  const inName = document.getElementById("profInputName");
  if (inName) inName.value = state.currentUserProfile.displayName || "";
  const secGroup = document.getElementById("profSectionGroup");
  if (secGroup) secGroup.style.display = state.currentUserProfile.role === "student" || state.currentUserProfile.role === "admin" ? "block" : "none";
  const secSelect = document.getElementById("profInputSection");
  if (secSelect) secSelect.value = state.currentUserProfile.section || "Mathematiques";

  const passMsg = document.getElementById("profPassMsg");
  if (passMsg) passMsg.style.display = "none";
  const pNew = document.getElementById("profNewPass");
  const pConf = document.getElementById("profConfirmPass");
  if (pNew) pNew.value = "";
  if (pConf) pConf.value = "";

  window.openModal("userProfileModal");
}

export function copyMyUid() {
  if (!state.currentUser) return;
  navigator.clipboard.writeText(state.currentUser.uid);
  alert("📋 Identifiant unique (UID) copié dans le presse-papier :\n" + state.currentUser.uid);
}

export function copyMyParentCode() {
  if (!state.currentUserProfile || !state.currentUserProfile.parentLinkCode) return;
  const code = state.currentUserProfile.parentLinkCode;
  navigator.clipboard.writeText(code);
  alert(`📋 Code de liaison copié dans le presse-papier :\n${code}\n\n💡 Donnez ce code à vos parents pour qu'ils puissent suivre votre planning et vos résultats.`);
}

export async function handleUpdateProfileInfo(e) {
  e.preventDefault();
  if (!state.currentUser || !state.currentUserProfile) return;

  const newName = document.getElementById("profInputName")?.value.trim();
  const newSection = document.getElementById("profInputSection")?.value;
  const feedback = document.getElementById("profInfoMsg");

  if (!newName) return;

  showLoading("Mise à jour du profil...");
  try {
    await updateProfile(state.currentUser, { displayName: newName });
    await set(ref(database, `users/${state.currentUser.uid}/displayName`), newName);
    if (state.currentUserProfile.role === "student" || state.currentUserProfile.role === "admin") {
      await set(ref(database, `users/${state.currentUser.uid}/section`), newSection);
      state.currentUserProfile.section = newSection;
    }
    state.currentUserProfile.displayName = newName;
    renderUserProfileBar();
    hideLoading();

    if (feedback) {
      feedback.style.display = "block";
      feedback.style.background = "#ecfdf5";
      feedback.style.color = "#047857";
      feedback.innerText = "✨ Vos informations ont été mises à jour avec succès !";
      setTimeout(() => {
        feedback.style.display = "none";
      }, 3000);
    } else {
      alert("✨ Informations enregistrées !");
    }
  } catch (err) {
    hideLoading();
    alert("Erreur de mise à jour : " + err.message);
  }
}

export async function handleUpdatePassword(e) {
  e.preventDefault();
  if (!state.currentUser) return;

  const newPass = document.getElementById("profNewPass")?.value;
  const confPass = document.getElementById("profConfirmPass")?.value;
  const passMsg = document.getElementById("profPassMsg");
  if (passMsg) passMsg.style.display = "none";

  if (!newPass || newPass.length < 6) {
    if (passMsg) {
      passMsg.style.display = "block";
      passMsg.style.background = "#fff1f2";
      passMsg.style.color = "#be123c";
      passMsg.innerText = "⚠️ Le mot de passe doit contenir au moins 6 caractères.";
    }
    return;
  }

  if (newPass !== confPass) {
    if (passMsg) {
      passMsg.style.display = "block";
      passMsg.style.background = "#fff1f2";
      passMsg.style.color = "#be123c";
      passMsg.innerText = "⚠️ Les deux mots de passe ne correspondent pas.";
    }
    return;
  }

  showLoading("Changement de mot de passe...");
  try {
    await updatePassword(state.currentUser, newPass);
    hideLoading();
    if (passMsg) {
      passMsg.style.display = "block";
      passMsg.style.background = "#ecfdf5";
      passMsg.style.color = "#047857";
      passMsg.innerText = "🎉 Votre mot de passe a été modifié avec succès !";
    }
    const pNew = document.getElementById("profNewPass");
    const pConf = document.getElementById("profConfirmPass");
    if (pNew) pNew.value = "";
    if (pConf) pConf.value = "";
  } catch (err) {
    hideLoading();
    if (passMsg) {
      passMsg.style.display = "block";
      passMsg.style.background = "#fff1f2";
      passMsg.style.color = "#be123c";
      if (err.code === "auth/requires-recent-login") {
        passMsg.innerHTML = "⚠️ Pour votre sécurité, veuillez vous <b>reconnecter</b> avant de pouvoir changer votre mot de passe, ou utilisez le bouton <i>'Lien par email'</i>.";
      } else {
        passMsg.innerText = "Erreur : " + err.message;
      }
    }
  }
}

export async function sendResetPassEmail() {
  if (!state.currentUser || !state.currentUser.email) return;
  window.showStyledConfirm(
    "Réinitialiser le mot de passe",
    `Envoyer un lien officiel de réinitialisation à l'adresse :\n${state.currentUser.email} ?`,
    "🔑",
    async () => {
      showLoading("Envoi du lien...");
      try {
        await sendPasswordResetEmail(auth, state.currentUser.email);
        hideLoading();
        alert(`✉️ Un email de réinitialisation sécurisé a été envoyé à :\n${state.currentUser.email}\n\nVérifiez votre boîte de réception (et vos spams).`);
      } catch (err) {
        hideLoading();
        alert("Erreur d'envoi de l'email : " + err.message);
      }
    }
  );
}

export function updateReadOnlyUI() {
  const banner = document.getElementById("viewContextBanner");
  const isConsultation = state.isReadOnly;

  if (banner) banner.style.display = isConsultation ? "flex" : "none";
  document.querySelectorAll(".student-action-btn").forEach((btn) => {
    btn.style.display = isConsultation ? "none" : "";
  });
}

export function openStudentCodeModal() {
  window.openModal("studentCodeModal");
}

export function copyParentCode() {
  const code = document.getElementById("myParentCodeDisplay")?.innerText;
  if (code) {
    navigator.clipboard.writeText(code);
    alert("✨ Code copié dans le presse-papier !");
  }
}

export async function linkChildWithCode() {
  const codeInp = document.getElementById("childLinkInput");
  const code = codeInp ? codeInp.value.trim().toUpperCase() : "";
  if (!code) return alert("Veuillez saisir un code.");

  showLoading("Vérification...");
  try {
    const codeSnap = await get(ref(database, `parent_codes/${code}`));
    if (!codeSnap.exists()) {
      hideLoading();
      return alert("Code introuvable. Vérifiez le code fourni par l'élève.");
    }

    const studentUid = codeSnap.val();
    const currentLinked = state.currentUserProfile.linkedStudents || [];
    if (!currentLinked.includes(studentUid)) {
      currentLinked.push(studentUid);
      await set(ref(database, `users/${state.currentUser.uid}/linkedStudents`), currentLinked);
      state.currentUserProfile.linkedStudents = currentLinked;
    }
    hideLoading();
    window.closeModal("linkChildModal");
    setupParentDashboard(studentUid);
    alert("Élève associé avec succès !");
  } catch (err) {
    hideLoading();
    alert("Erreur : " + err.message);
  }
}

export async function setupParentDashboard(preselectedUid = null) {
  const linked = state.currentUserProfile.linkedStudents || [];
  const selectEl = document.getElementById("parentChildSelect");
  if (!selectEl) return;
  selectEl.innerHTML = "";

  if (linked.length === 0) {
    state.activeStudentUid = null;
    detachAllDataListeners();
    state.db = [];
    state.examsDb = [];
    state.userGrades = {};
    window.render();
    window.openModal("linkChildModal");
    return;
  }

  for (const sUid of linked) {
    const sSnap = await get(ref(database, `users/${sUid}`));
    const sProfile = sSnap.val();
    const name = sProfile ? sProfile.displayName || sProfile.email : sUid;
    const opt = document.createElement("option");
    opt.value = sUid;
    opt.innerText = name;
    selectEl.appendChild(opt);
  }

  const targetUid = preselectedUid || linked[0];
  selectEl.value = targetUid;
  onParentSelectChild(targetUid);
}

export async function onParentSelectChild(sUid) {
  state.activeStudentUid = sUid;
  const sSnap = await get(ref(database, `users/${sUid}`));
  state.activeStudentProfile = sSnap.val();
  const bannerText = document.getElementById("viewContextText");
  if (bannerText) {
    bannerText.innerText = `👁️ Consultation en direct du planning de : ${state.activeStudentProfile?.displayName || sUid}`;
  }
  attachStudentDataListeners(sUid);
}

export function detachAllDataListeners() {
  state.activeDataListeners.forEach(({ refPath, callback }) => off(refPath, callback));
  state.activeDataListeners = [];
}

export function attachStudentDataListeners(sUid) {
  detachAllDataListeners();

  const seancesRef = ref(database, `student_data/${sUid}/seances`);
  const onSeances = onValue(seancesRef, (snapshot) => {
    state.db = [];
    snapshot.forEach((child) => {
      state.db.push(child.val());
    });
    render();
  });
  state.activeDataListeners.push({ refPath: seancesRef, callback: onSeances });

  const examsRef = ref(database, `student_data/${sUid}/examens`);
  const onExams = onValue(examsRef, (snapshot) => {
    state.examsDb = [];
    snapshot.forEach((child) => {
      state.examsDb.push(child.val());
    });
    render();
  });
  state.activeDataListeners.push({ refPath: examsRef, callback: onExams });

  const notesRef = ref(database, `student_data/${sUid}/notes_trimestrielles`);
  const onNotes = onValue(notesRef, (snapshot) => {
    state.userGrades = snapshot.val() || {};
    switchTrimester(state.currentTrimester);
  });
  state.activeDataListeners.push({ refPath: notesRef, callback: onNotes });

  const bacArchiveRef = ref(database, `student_data/${sUid}/bac_archive`);
  const onBac = onValue(bacArchiveRef, (snapshot) => {
    state.bacArchiveData = snapshot.val() || {};
    selectBacSubject(state.currentBacSubjectId);
  });
  state.activeDataListeners.push({ refPath: bacArchiveRef, callback: onBac });

  const seancesTodosRef = ref(database, `student_data/${sUid}/seances_todos`);
  const onSeancesTodos = onValue(seancesTodosRef, (snapshot) => {
    state.sessionDateTodos = snapshot.val() || {};
    render();
  });
  state.activeDataListeners.push({ refPath: seancesTodosRef, callback: onSeancesTodos });
}

// Global Window Bindings
window.showAuthModal = showAuthModal;
window.switchAuthTab = switchAuthTab;
window.selectRole = selectRole;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
window.openUserProfileModal = openUserProfileModal;
window.copyMyUid = copyMyUid;
window.copyMyParentCode = copyMyParentCode;
window.handleUpdateProfileInfo = handleUpdateProfileInfo;
window.handleUpdatePassword = handleUpdatePassword;
window.sendResetPassEmail = sendResetPassEmail;
window.openStudentCodeModal = openStudentCodeModal;
window.copyParentCode = copyParentCode;
window.linkChildWithCode = linkChildWithCode;
window.onParentSelectChild = onParentSelectChild;
window.updateReadOnlyUI = updateReadOnlyUI;
window.attachStudentDataListeners = attachStudentDataListeners;
