// js/notifications.js
// Système de Notifications et Rappels Intelligents pour les Cours et Séances d'Étude

import { state, formatM, getSubjectMeta, playBeep } from "./state.js?v=16.2";

const sentNotifications = new Set();

export function requestNotificationPermission() {
  if (!("Notification" in window)) {
    showInAppToast("🔔 Notifications non supportées", "Votre navigateur ne supporte pas les notifications système.", "⚠️");
    return;
  }

  if (Notification.permission === "granted") {
    showInAppToast("🔔 Notifications déjà actives", "Vous recevrez des rappels avant vos cours particuliers, cours en ligne et pour vos séances à la maison.", "✅");
    updateNotifButtonState();
    return;
  }

  Notification.requestPermission().then((permission) => {
    updateNotifButtonState();
    if (permission === "granted") {
      sendAppNotification(
        "🎉 Rappels Activés avec Succès !",
        "Vous serez prévenu(e) avant chaque cours particulier/en ligne avec le rappel de vos exercices, et dès le début de vos séances d'étude à la maison.",
        "🔔",
        "welcome_notif"
      );
    } else {
      showInAppToast("⚠️ Notifications bloquées", "Veuillez autoriser les notifications dans les paramètres de votre navigateur pour recevoir les rappels.", "⚠️");
    }
  });
}

export function updateNotifButtonState() {
  const btn = document.getElementById("btnToggleNotifications");
  if (!btn) return;

  if (!("Notification" in window)) {
    btn.innerHTML = "🔔 Rappels : Non supportés";
    btn.style.opacity = "0.6";
    return;
  }

  if (Notification.permission === "granted") {
    btn.innerHTML = "🔔 Rappels Actifs ✅";
    btn.style.background = "#dcfce7";
    btn.style.color = "#15803d";
    btn.style.borderColor = "#86efac";
  } else if (Notification.permission === "denied") {
    btn.innerHTML = "🔕 Rappels Bloqués ❌";
    btn.style.background = "#fee2e2";
    btn.style.color = "#b91c1c";
    btn.style.borderColor = "#fca5a5";
  } else {
    btn.innerHTML = "🔔 Activer Rappels";
    btn.style.background = "var(--card)";
    btn.style.color = "var(--primary)";
    btn.style.borderColor = "var(--primary)";
  }
}

export function sendAppNotification(title, body, icon = "🔔", tag = null) {
  // 1. Notification Système du Navigateur
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, {
        body: body,
        icon: "https://cdn-icons-png.flaticon.com/512/2907/2907150.png",
        tag: tag || "notif_" + Date.now(),
        requireInteraction: true,
      });
    } catch (e) {
      console.warn("Erreur notification système:", e);
    }
  }

  // 2. Alerte Sonore
  playNotificationSound();

  // 3. Notification Visuelle In-App (Toast flottant)
  showInAppToast(title, body, icon);
}

export function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
    osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.3); // D6

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  } catch (e) {}
}

export function showInAppToast(title, body, icon = "🔔") {
  let container = document.getElementById("appToastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "appToastContainer";
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 400px;
      width: calc(100vw - 40px);
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.style.cssText = `
    pointer-events: auto;
    background: var(--card, #ffffff);
    color: var(--text, #0f172a);
    border: 1.5px solid var(--primary, #0284c7);
    border-radius: 16px;
    padding: 14px 18px;
    box-shadow: 0 12px 30px rgba(0,0,0,0.25);
    display: flex;
    gap: 12px;
    align-items: flex-start;
    animation: toastSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    backdrop-filter: blur(12px);
  `;

  toast.innerHTML = `
    <div style="font-size: 26px; line-height: 1;">${icon}</div>
    <div style="flex: 1;">
      <div style="font-weight: 800; font-size: 14px; color: var(--text);">${title}</div>
      <div style="font-size: 12.5px; opacity: 0.9; margin-top: 4px; line-height: 1.4; color: var(--text);">${body}</div>
    </div>
    <button style="background: none; border: none; font-size: 16px; cursor: pointer; color: var(--muted); padding: 0 4px;" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "opacity 0.4s ease, transform 0.4s ease";
    toast.style.opacity = "0";
    toast.style.transform = "translateX(50px)";
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 10000);
}

export function checkUpcomingSessions() {
  if (!state.db || !state.db.length) return;

  const now = new Date();
  const realDayIdx = (now.getDay() + 6) % 7; // 0=Lundi ... 6=Dimanche
  const currentMins = now.getHours() * 60 + now.getMinutes();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  const todayDateKey = `${year}-${month}-${date}`;

  state.db.forEach((ev) => {
    if (ev.day !== realDayIdx) return;
    if (window.shouldShowSession && !window.shouldShowSession(ev, realDayIdx, getMon(now))) return;

    const meta = getSubjectMeta(ev.sub);
    const isPart = ev.type && ev.type.includes("Particulier");
    const isOnline = ev.type && ev.type.includes("ligne");
    const isHome = ev.type && ev.type.includes("maison");

    const todoKey = `${ev.id}_${todayDateKey}`;
    const todoObj = state.sessionDateTodos && state.sessionDateTodos[todoKey];
    const hasTodo = Boolean(todoObj && todoObj.todo && todoObj.todo.trim());
    const isDone = todoObj && todoObj.todoDone === true;
    const todoSummary = hasTodo
      ? isDone
        ? `✅ Exercices terminés : ${todoObj.todo}`
        : `⏳ Exercices à faire : ${todoObj.todo}`
      : "Pensez à préparer vos séries et questions pour le professeur !";

    const minsUntilStart = ev.s - currentMins;

    // --- RAPPEL 1 : 15 à 20 min avant Cours Particulier ou Cours En Ligne ---
    if ((isPart || isOnline) && minsUntilStart >= 10 && minsUntilStart <= 20) {
      const notifKey = `remind_pre_${ev.id}_${todayDateKey}`;
      if (!sentNotifications.has(notifKey)) {
        sentNotifications.add(notifKey);
        const sessionKind = isPart ? "Cours Particulier" : "Cours en Ligne";
        sendAppNotification(
          `⏳ Dans ${minsUntilStart} min : ${meta.ico} ${ev.sub} (${sessionKind})`,
          `📝 <b>Rappel Devoirs :</b> ${todoSummary}\n🕒 Début à ${formatM(ev.s)} (jusqu'à ${formatM(ev.e)})`,
          "📍",
          notifKey
        );
      }
    }

    // --- RAPPEL 2 : Début de la séance d'étude (À la maison, En ligne ou Particulier) ---
    if (currentMins >= ev.s && currentMins <= ev.s + 3) {
      const notifKey = `start_session_${ev.id}_${todayDateKey}`;
      if (!sentNotifications.has(notifKey)) {
        sentNotifications.add(notifKey);
        const sessionKind = isHome ? "🏠 Étude à la maison" : isOnline ? "🌐 Cours en Ligne" : isPart ? "📍 Cours Particulier" : "🏫 Cours";
        sendAppNotification(
          `🔔 Début de votre séance : ${meta.ico} ${ev.sub}`,
          `🎯 <b>${sessionKind}</b> en cours de <b>${formatM(ev.s)}</b> à <b>${formatM(ev.e)}</b>.\n${hasTodo && !isDone ? "⚠️ N'oubliez pas vos exercices : " + todoObj.todo : "Bonne concentration et bon travail !"}`,
          "🎯",
          notifKey
        );
      }
    }
  });
}

// Initialisation du moniteur de rappels en arrière-plan
let sessionMonitorInterval = null;
export function initNotificationsSystem() {
  updateNotifButtonState();
  if (sessionMonitorInterval) clearInterval(sessionMonitorInterval);
  checkUpcomingSessions();
  sessionMonitorInterval = setInterval(checkUpcomingSessions, 30000); // Vérification toutes les 30 secondes
}

// Global Window Bindings
window.requestNotificationPermission = requestNotificationPermission;
window.sendAppNotification = sendAppNotification;
window.showInAppToast = showInAppToast;
window.checkUpcomingSessions = checkUpcomingSessions;
window.initNotificationsSystem = initNotificationsSystem;
