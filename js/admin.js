// js/admin.js
// Console d'Administration, Validation des Comptes et Annonces Globales

import { database, auth, ref, get, set, remove, onValue, sendPasswordResetEmail } from "./firebase-config.js?v=18.0";
import { state, showLoading, hideLoading } from "./state.js?v=18.0";

export function switchAdminTab(tab) {
  const tabPending = document.getElementById("adminTabPending");
  const tabUsers = document.getElementById("adminTabUsers");
  const tabAnn = document.getElementById("adminTabAnnouncements");

  if (tabPending) tabPending.classList.toggle("active", tab === "pending");
  if (tabUsers) tabUsers.classList.toggle("active", tab === "users");
  if (tabAnn) tabAnn.classList.toggle("active", tab === "announcements");

  const vPending = document.getElementById("adminViewPending");
  const vUsers = document.getElementById("adminViewUsers");
  const vAnn = document.getElementById("adminViewAnnouncements");

  if (vPending) vPending.style.display = tab === "pending" ? "block" : "none";
  if (vUsers) vUsers.style.display = tab === "users" ? "block" : "none";
  if (vAnn) vAnn.style.display = tab === "announcements" ? "flex" : "none";
}

export async function loadAdminKPIs() {
  try {
    const usersSnap = await get(ref(database, "users"));
    let total = 0,
      students = 0,
      parents = 0,
      pending = 0;
    state.allUsersCache = [];

    if (usersSnap.exists()) {
      usersSnap.forEach((child) => {
        const u = child.val();
        state.allUsersCache.push(u);
        total++;
        if (u.role === "student") students++;
        if (u.role === "parent") parents++;
        if (u.status === "pending") pending++;
      });
    }

    const tEl = document.getElementById("kpiTotalUsers");
    const sEl = document.getElementById("kpiTotalStudents");
    const pEl = document.getElementById("kpiTotalParents");
    const pendEl = document.getElementById("kpiPendingUsers");
    const bPendEl = document.getElementById("adminPendingBadge");

    if (tEl) tEl.innerText = total;
    if (sEl) sEl.innerText = students;
    if (pEl) pEl.innerText = parents;
    if (pendEl) pendEl.innerText = pending;
    if (bPendEl) bPendEl.innerText = pending;

    renderAdminPendingTable();
    renderAdminUsersTable();
  } catch (e) {
    console.error("Erreur chargement KPIs admin:", e);
  }
}

export function renderAdminPendingTable() {
  const tbody = document.getElementById("adminPendingTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const pendingUsers = state.allUsersCache.filter((u) => u.status === "pending");
  if (!pendingUsers.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:24px; color:var(--muted); font-weight:700;">✨ Aucune demande en attente pour le moment.</td></tr>`;
    return;
  }

  pendingUsers.forEach((u) => {
    const tr = document.createElement("tr");
    const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "Récemment";
    const roleBadgeClass = `role-${u.role || "student"}`;

    tr.innerHTML = `
      <td>
        <div style="font-weight:800;">${u.displayName || "Sans nom"}</div>
        <div style="font-size:11px; color:var(--muted);">${u.email || ""}</div>
      </td>
      <td><span class="role-badge ${roleBadgeClass}">${(u.role || "student").toUpperCase()}</span></td>
      <td>${u.section || "N/A"}</td>
      <td style="font-size:12px; color:var(--muted);">${dateStr}</td>
      <td style="display:flex; gap:6px;">
        <button class="btn-add" style="padding:5px 12px; font-size:12px;" onclick="window.approveUserByAdmin('${u.uid}')">✅ Accepter</button>
        <button class="btn-action" style="padding:5px 10px; font-size:12px; color:#ef4444;" onclick="window.rejectUserByAdmin('${u.uid}', '${u.parentLinkCode || ""}')">❌ Refuser</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

export async function approveUserByAdmin(uid) {
  showLoading("Validation du compte...");
  try {
    await set(ref(database, `users/${uid}/status`), "approved");
    hideLoading();
    alert("Compte validé avec succès ! L'utilisateur peut désormais se connecter.");
    loadAdminKPIs();
  } catch (e) {
    hideLoading();
    alert("Erreur lors de la validation : " + e.message);
  }
}

export async function rejectUserByAdmin(uid, parentCode) {
  window.showStyledConfirm(
    "Refuser la demande",
    "Refuser cette demande et supprimer le compte en attente ?",
    "❌",
    async () => {
      showLoading("Suppression de la demande...");
      try {
        await remove(ref(database, `users/${uid}`));
        if (parentCode) await remove(ref(database, `parent_codes/${parentCode}`));
        hideLoading();
        alert("Demande refusée et supprimée.");
        loadAdminKPIs();
      } catch (e) {
        hideLoading();
        alert("Erreur : " + e.message);
      }
    }
  );
}

export function renderAdminUsersTable() {
  const tbody = document.getElementById("adminUsersTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const query = (document.getElementById("adminSearchInput")?.value || "").toLowerCase();
  const filtered = state.allUsersCache.filter((u) => {
    const matchName = (u.displayName || "").toLowerCase().includes(query);
    const matchEmail = (u.email || "").toLowerCase().includes(query);
    const matchCode = (u.parentLinkCode || "").toLowerCase().includes(query);
    return matchName || matchEmail || matchCode;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--muted)">Aucun utilisateur correspondant.</td></tr>`;
    return;
  }

  filtered.forEach((u) => {
    const tr = document.createElement("tr");
    const dateStr = u.createdAt ? new Date(u.createdAt).toLocaleDateString("fr-FR") : "N/A";
    const roleBadgeClass = `role-${u.role || "student"}`;
    const status = u.status || "approved";

    let statusBadge = `<span style="font-size:11px; font-weight:800; background:#dcfce7; color:#15803d; padding:2px 7px; border-radius:99px;">✅ Actif</span>`;
    if (status === "pending") {
      statusBadge = `<span style="font-size:11px; font-weight:800; background:#fef3c7; color:#b45309; padding:2px 7px; border-radius:99px;">⏳ En attente</span>`;
    } else if (status === "rejected") {
      statusBadge = `<span style="font-size:11px; font-weight:800; background:#fee2e2; color:#b91c1c; padding:2px 7px; border-radius:99px;">❌ Refusé</span>`;
    }

    let details = "-";
    if (u.role === "student" || u.role === "admin") details = `Section: <b>${u.section || "Maths"}</b> | Code: <code>${u.parentLinkCode || "N/A"}</code>`;
    else if (u.role === "parent") details = `${(u.linkedStudents || []).length} élève(s) associé(s)`;

    const isTutorActive = u.tutorAiEnabled !== false;
    const tutorToggleBtn = `<button type="button" class="btn-action" style="padding:4px 8px; font-size:11px; ${isTutorActive ? "color:#059669; font-weight:800; border-color:#a7f3d0; background:#ecfdf5;" : "color:#ef4444; border-color:#fecdd3; background:#fff1f2;"}" title="Activer / Désactiver le Tuteur IA pour ce compte" onclick="window.toggleUserTutorAi('${u.uid}', ${isTutorActive})">${isTutorActive ? "🤖 Tuteur: Actif ✅" : "🤖 Tuteur: Inactif ❌"}</button>`;

    tr.innerHTML = `
      <td>${statusBadge}</td>
      <td>
        <div style="font-weight:800;">${u.displayName || "Sans nom"}</div>
        <div style="font-size:11px; color:var(--muted);">${u.email || ""}</div>
      </td>
      <td><span class="role-badge ${roleBadgeClass}">${(u.role || "student").toUpperCase()}</span></td>
      <td><span style="font-size:12px;">${details}</span></td>
      <td style="font-size:12px; color:var(--muted);">${dateStr}</td>
      <td style="display:flex; gap:5px; flex-wrap:wrap;">
        <button class="btn-action" style="padding:4px 8px; font-size:11px;" title="Copier l'UID" onclick="navigator.clipboard.writeText('${u.uid}'); alert('📋 UID copié : ${u.uid}')">📋 UID</button>
        ${status === "pending" ? `<button class="btn-add" style="padding:4px 8px; font-size:11px;" onclick="window.approveUserByAdmin('${u.uid}')">✅ Valider</button>` : ""}
        ${tutorToggleBtn}
        ${(u.role === "student" || u.role === "admin") && status === "approved" ? `<button class="btn-action" style="padding:4px 8px; font-size:11px;" onclick="window.inspectStudentByAdmin('${u.uid}')">👁️ Inspecter</button>` : ""}
        <button class="btn-action" style="padding:4px 8px; font-size:11px;" title="Envoyer email de réinitialisation" onclick="window.adminResetUserPassword('${u.email}')">🔑 Réinit Pass</button>
        <button class="btn-action" style="padding:4px 8px; font-size:11px; color:#ef4444;" onclick="window.deleteUserByAdmin('${u.uid}', '${u.parentLinkCode || ""}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

export async function toggleUserTutorAi(uid, currentStatus) {
  const newStatus = !currentStatus;
  showLoading(newStatus ? "Activation du Tuteur IA..." : "Désactivation du Tuteur IA...");
  try {
    await set(ref(database, `users/${uid}/tutorAiEnabled`), newStatus);
    hideLoading();
    loadAdminKPIs();
  } catch (e) {
    hideLoading();
    alert("Erreur lors de la mise à jour des permissions : " + e.message);
  }
}

export async function adminResetUserPassword(email) {
  if (!email) return alert("Cet utilisateur n'a pas d'adresse email valide.");
  window.showStyledConfirm(
    "Réinitialiser le mot de passe",
    `Envoyer un lien officiel de réinitialisation de mot de passe à l'adresse : ${email} ?`,
    "🔑",
    async () => {
      showLoading("Envoi du lien de réinitialisation...");
      try {
        await sendPasswordResetEmail(auth, email);
        hideLoading();
        alert(`✉️ Le lien sécurisé de réinitialisation a été envoyé avec succès à : ${email}`);
      } catch (err) {
        hideLoading();
        alert("Erreur lors de l'envoi : " + err.message);
      }
    }
  );
}

export async function inspectStudentByAdmin(studentUid) {
  state.activeStudentUid = studentUid;
  const sSnap = await get(ref(database, `users/${studentUid}`));
  state.activeStudentProfile = sSnap.val();
  state.isReadOnly = false;
  window.updateReadOnlyUI();
  window.attachStudentDataListeners(studentUid);
  window.closeOverlay("adminOverlay");
  alert(`Vous supervisez le tableau de bord de : ${state.activeStudentProfile?.displayName || studentUid}`);
}

export async function deleteUserByAdmin(uid, parentCode) {
  window.showStyledConfirm(
    "Supprimer l'utilisateur",
    "Voulez-vous supprimer définitivement cet utilisateur et toutes ses données ?",
    "🗑️",
    async () => {
      await remove(ref(database, `users/${uid}`));
      await remove(ref(database, `student_data/${uid}`));
      if (parentCode) await remove(ref(database, `parent_codes/${parentCode}`));
      alert("Utilisateur supprimé.");
      loadAdminKPIs();
    }
  );
}

export async function publishAdminAnnouncement() {
  const title = document.getElementById("annTitle")?.value.trim();
  const content = document.getElementById("annContent")?.value.trim();
  if (!title || !content) return alert("Veuillez remplir le titre et le message.");

  const newId = Date.now().toString();
  await set(ref(database, `system_config/announcements/${newId}`), {
    id: newId,
    title,
    content,
    date: new Date().toLocaleDateString("fr-FR"),
    author: state.currentUserProfile?.displayName || "Admin",
  });

  const tEl = document.getElementById("annTitle");
  const cEl = document.getElementById("annContent");
  if (tEl) tEl.value = "";
  if (cEl) cEl.value = "";
  alert("✨ Annonce publiée !");
}

export function listenToAnnouncements() {
  onValue(ref(database, "system_config/announcements"), (snapshot) => {
    const annList = [];
    snapshot.forEach((c) => annList.push(c.val()));

    const bar = document.getElementById("activeAnnouncementBar");
    const barText = document.getElementById("activeAnnouncementText");
    if (annList.length > 0) {
      const latest = annList[annList.length - 1];
      if (barText) barText.innerHTML = `📢 <b>${latest.title}</b> : ${latest.content} <span style="font-size:10px; opacity:0.8">(${latest.date})</span>`;
      if (bar) bar.style.display = "flex";
    } else {
      if (bar) bar.style.display = "none";
    }

    const adminList = document.getElementById("adminAnnouncementsList");
    if (adminList) {
      adminList.innerHTML = "";
      annList.forEach((a) => {
        adminList.innerHTML += `
          <div style="background:var(--bg); border:1.5px solid var(--dash); border-radius:12px; padding:12px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:800; font-size:14px;">${a.title}</div>
              <div style="font-size:12px; color:var(--muted); margin-top:2px;">${a.content}</div>
              <div style="font-size:11px; color:var(--primary); margin-top:4px;">Par ${a.author} le ${a.date}</div>
            </div>
            <button class="btn-action" style="color:#ef4444;" onclick="window.deleteAnnouncement('${a.id}')">Supprimer 🗑️</button>
          </div>
        `;
      });
    }
  });
}

export function deleteAnnouncement(id) {
  window.showStyledConfirm(
    "Supprimer l'annonce",
    "Voulez-vous supprimer cette annonce globale ?",
    "📢",
    () => {
      remove(ref(database, `system_config/announcements/${id}`));
    }
  );
}

export function openAdminOverlayDirect() {
  const profile = state.currentUserProfile || {};
  const email = (state.currentUser?.email || profile.email || "").toLowerCase().trim();
  const isAdmin =
    profile.role === "admin" ||
    email === "ahmedazzouzi72@gmail.com" ||
    email === "admin@agenda.tn" ||
    email === "admin@planningbac.tn";

  if (!isAdmin) {
    if (confirm("🛡️ La gestion des comptes et la console d'administration sont réservées à l'Administrateur.\n\nSouhaitez-vous vous connecter en tant qu'Administrateur ?")) {
      window.showAuthModal();
    }
    return;
  }

  loadAdminKPIs();
  window.openOverlay("adminOverlay");
}

// Global Window Bindings
window.switchAdminTab = switchAdminTab;
window.renderAdminPendingTable = renderAdminPendingTable;
window.approveUserByAdmin = approveUserByAdmin;
window.rejectUserByAdmin = rejectUserByAdmin;
window.renderAdminUsersTable = renderAdminUsersTable;
window.toggleUserTutorAi = toggleUserTutorAi;
window.adminResetUserPassword = adminResetUserPassword;
window.inspectStudentByAdmin = inspectStudentByAdmin;
window.deleteUserByAdmin = deleteUserByAdmin;
window.publishAdminAnnouncement = publishAdminAnnouncement;
window.deleteAnnouncement = deleteAnnouncement;
window.openAdminOverlayDirect = openAdminOverlayDirect;
