// js/tutor-bot.js
// Tuteur IA Éducatif Gemini Pro (Baccalauréat Tunisien) & Correction d'Exercices par Photo

import { getAiModelName, getAiApiKey } from "./ai-assistant.js";
import { state, showLoading, hideLoading, playBeep } from "./state.js";

let tutorChatHistory = [];
let tutorAttachedImageBase64 = null;
let tutorAttachedImageMime = "image/jpeg";
let tutorSpeechRecognition = null;
let isTutorListening = false;

const TUTOR_SYSTEM_INSTRUCTION = `Tu es "Tuteur Bac IA", un professeur particulier d'élite et tuteur bienveillant dédié exclusivement aux élèves préparant le Baccalauréat (notamment le Baccalauréat Tunisien pour toutes les sections : Mathématiques, Sciences Expérimentales, Informatique, Économie et Gestion, Technique, Lettres et Sport).

RÈGLES STRICTES ET NON NÉGOCIABLES :
1. PÉRIMÈTRE STRICTEMENT ÉDUCATIF : Tu réponds UNIQUEMENT aux questions scolaires et pédagogiques :
   - Mathématiques (Analyse, Géométrie dans l'espace, Nombres Complexes, Arithmétique, Probabilités...)
   - Sciences Physiques (Chimie, Électricité, Mécanique, Ondes, Nucléaire...)
   - Sciences de la Vie et de la Terre (SVT)
   - Informatique & Algorithmique (Python, SQL, HTML/CSS/JS, algorithmes récursifs et itératifs...)
   - Philosophie (Méthode de dissertation, commentaire, notions du programme...)
   - Langues (Français, Arabe, Anglais, Italien, Espagnol, Allemand)
   - Économie & Gestion (Micro/Macro, Comptabilité, Gestion financière...)
   - Sciences Techniques (Génie Électrique, Génie Mécanique...)
   - Méthodologie d'apprentissage, gestion du temps et organisation des révisions du Bac.

2. REFUS DES SUJETS HORS-PROGRAMME :
   Si l'élève te pose une question non éducative (ex: jeux vidéo, divertissement, potins, sujets politiques ou sans rapport avec l'apprentissage scolaire), refuse poliment et avec humour ou bienveillance, en français ou en dialecte tunisien (Derja), et réoriente immédiatement vers une révision du Bac.
   Exemple : "Je suis ton Tuteur Bac IA dédié à 100% à ta réussite scolaire ! 🎓 Pose-moi une question sur tes cours (Maths, Physique, SVT, Info, Philo...) ou envoie-moi une photo d'exercice à corriger."

3. CORRECTION D'EXERCICES ET DEVOIRS (PAR PHOTO OU TEXTE) :
   Lorsque l'élève t'envoie une photo d'énoncé ou de son travail manuscrit :
   - Étape 1 : Identifie le chapitre et l'objectif de l'exercice.
   - Étape 2 : Si l'élève a inclus sa tentative/brouillon, repère avec précision les erreurs et explique pourquoi.
   - Étape 3 : Rédige la solution complète, étape par étape, claire et rigoureuse selon les exigences officielles du Bac.
   - Étape 4 : Donne une astuce clé ("Conseil Bac / Barème") pour éviter les pièges classiques.

4. TONE & FORMAT :
   - Sois encourageant, clair, pédagogique et structuré (titres en gras, puces, étapes numérotées, blocs de code avec syntaxe claire).
   - Tu comprends parfaitement le français, l'arabe classique et le dialecte tunisien (Derja / Arabizi). Tu peux répondre en français soigné ou adapter tes explications bilingues selon le besoin de l'élève.`;

export function getTutorModelName() {
  const saved = localStorage.getItem("gemini_model_name");
  if (saved && (saved.includes("pro") || saved.includes("3.1"))) return saved.trim();
  return "gemini-1.5-pro"; // Modèle Gemini Pro par défaut pour le tuteur
}

export function openTutorChat() {
  if (state.currentUserProfile && state.currentUserProfile.role === "student" && state.currentUserProfile.tutorAiEnabled === false) {
    alert("🔒 Accès Tuteur IA Désactivé\n\nCette option n'a pas été activée pour votre compte par l'administrateur. Veuillez contacter votre administrateur pour débloquer l'accès au Tuteur IA et à la correction par photo.");
    return;
  }

  const modal = document.getElementById("tutorChatModal");
  if (modal) modal.style.display = "flex";

  const modelBadge = document.getElementById("tutorModelBadge");
  if (modelBadge) {
    const currentModel = getTutorModelName();
    modelBadge.innerText = `✨ ${currentModel === "gemini-1.5-pro" ? "Gemini 1.5 Pro" : currentModel}`;
  }

  if (tutorChatHistory.length === 0) {
    renderTutorWelcomeMessage();
  }

  scrollTutorToBottom();
}

export function closeTutorChat() {
  if (isTutorListening && tutorSpeechRecognition) {
    try {
      tutorSpeechRecognition.stop();
    } catch (e) {}
  }
  isTutorListening = false;
  const modal = document.getElementById("tutorChatModal");
  if (modal) modal.style.display = "none";
}

export function renderTutorWelcomeMessage() {
  const userName = state.currentUserProfile?.displayName || "futur bachelier";
  const userSection = state.currentUserProfile?.section || "Bac";

  const welcomeHtml = `
    Bonjour <b>${userName}</b> ! 🎓 Je suis ton <b>Tuteur IA Éducatif</b> pour le <b>${userSection}</b>.
    <br><br>
    Je suis là pour t'aider à réussir ton Bac :
    <ul style="margin: 6px 0 6px 18px; padding: 0;">
      <li>📐 <b>Explications de cours</b> et théorèmes en Maths, Physique, SVT, Info, Philo...</li>
      <li>📸 <b>Correction d'exercices par photo</b> : clique sur 📷 pour m'envoyer un énoncé ou ton brouillon !</li>
      <li>💡 <b>Quiz et questions d'entraînement</b> pour tester tes connaissances.</li>
    </ul>
    Quelle notion ou exercice souhaites-tu travailler aujourd'hui ?
  `;

  appendTutorMessage("bot", welcomeHtml);
}

export function appendTutorMessage(sender, htmlContent, imageUrl = null) {
  const container = document.getElementById("tutorChatMessages");
  if (!container) return;

  const msgDiv = document.createElement("div");
  msgDiv.className = `tutor-msg ${sender}`;

  const avatar = document.createElement("div");
  avatar.className = "tutor-avatar";
  avatar.innerText = sender === "bot" ? "🤖" : "🎓";

  const bubble = document.createElement("div");
  bubble.className = "tutor-bubble";

  let imgHtml = "";
  if (imageUrl) {
    imgHtml = `<img src="${imageUrl}" class="tutor-msg-img" onclick="window.open('${imageUrl}', '_blank')" alt="Photo exercice" title="Cliquer pour agrandir" />`;
  }

  bubble.innerHTML = imgHtml + htmlContent;

  msgDiv.appendChild(avatar);
  msgDiv.appendChild(bubble);
  container.appendChild(msgDiv);

  scrollTutorToBottom();
}

export function scrollTutorToBottom() {
  const container = document.getElementById("tutorChatMessages");
  if (container) {
    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 50);
  }
}

export function handleTutorPhotoSelect(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const dataUrl = e.target.result;
    tutorAttachedImageMime = file.type || "image/jpeg";
    tutorAttachedImageBase64 = dataUrl.split(",")[1];

    const previewTag = document.getElementById("tutorPhotoPreviewTag");
    const previewName = document.getElementById("tutorPhotoPreviewName");

    if (previewName) previewName.innerText = file.name.length > 20 ? file.name.substring(0, 20) + "..." : file.name;
    if (previewTag) previewTag.style.display = "inline-flex";

    const textInp = document.getElementById("tutorTextInput");
    if (textInp && !textInp.value.trim()) {
      textInp.value = "Peux-tu corriger et m'expliquer cet exercice étape par étape ?";
    }
  };
  reader.readAsDataURL(file);
}

export function clearTutorAttachedPhoto() {
  tutorAttachedImageBase64 = null;
  const previewTag = document.getElementById("tutorPhotoPreviewTag");
  if (previewTag) previewTag.style.display = "none";
  const fileInp = document.getElementById("tutorPhotoInput");
  if (fileInp) fileInp.value = "";
}

export function useTutorQuickPrompt(text) {
  const input = document.getElementById("tutorTextInput");
  if (input) {
    input.value = text;
    input.focus();
  }
}

export function clearTutorChatHistory() {
  window.showStyledConfirm(
    "Effacer la conversation",
    "Voulez-vous réinitialiser la discussion avec votre Tuteur IA ?",
    "🗑️",
    () => {
      tutorChatHistory = [];
      const container = document.getElementById("tutorChatMessages");
      if (container) container.innerHTML = "";
      clearTutorAttachedPhoto();
      renderTutorWelcomeMessage();
    }
  );
}

export async function sendTutorMessage() {
  if (state.currentUserProfile && state.currentUserProfile.role === "student" && state.currentUserProfile.tutorAiEnabled === false) {
    appendTutorMessage(
      "bot",
      "🔒 <b>Accès restreint</b> : Le Tuteur IA n'est pas activé pour votre compte. Contactez l'administrateur pour débloquer cette fonctionnalité."
    );
    return;
  }

  const textInput = document.getElementById("tutorTextInput");
  const userText = textInput ? textInput.value.trim() : "";
  const attachedBase64 = tutorAttachedImageBase64;
  const attachedMime = tutorAttachedImageMime;

  if (!userText && !attachedBase64) return;

  const apiKey = getAiApiKey();

  let userDisplayImg = null;
  if (attachedBase64) {
    userDisplayImg = `data:${attachedMime};base64,${attachedBase64}`;
  }

  appendTutorMessage("user", formatUserMessageText(userText || "Analyse de cette photo d'exercice"), userDisplayImg);

  if (textInput) textInput.value = "";
  clearTutorAttachedPhoto();

  const loadingMsgId = "tutor_typing_" + Date.now();
  appendTutorMessage(
    "bot",
    `<span id="${loadingMsgId}">🧠 <i>Analyse pédagogique en cours par le Tuteur IA...</i></span>`
  );

  try {
    const modelName = getTutorModelName();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const parts = [];

    if (attachedBase64) {
      parts.push({
        inlineData: {
          mimeType: attachedMime,
          data: attachedBase64,
        },
      });
    }

    const fullPrompt = `${TUTOR_SYSTEM_INSTRUCTION}

SECTION DE L'ÉLÈVE : ${state.currentUserProfile?.section || "Toutes sections"}

HISTORIQUE RÉCENT :
${tutorChatHistory.slice(-4).map((h) => `${h.role === "user" ? "Élève" : "Tuteur"}: ${h.text}`).join("\n")}

MESSAGE / QUESTION DE L'ÉLÈVE :
"${userText || "Voici l'image de mon exercice. Corrige-le et explique la méthode pas à pas."}"`;

    parts.push({ text: fullPrompt });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    });

    const loadingEl = document.getElementById(loadingMsgId);
    if (loadingEl && loadingEl.parentElement) {
      loadingEl.parentElement.parentElement.remove();
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      appendTutorMessage(
        "bot",
        `❌ <b>Erreur (${res.status})</b> : ${errData.error?.message || "Impossible d'obtenir une réponse de Gemini. Vérifiez votre clé API ou votre connexion internet."}`
      );
      return;
    }

    const data = await res.json();
    const botReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Désolé, je n'ai pas pu formuler d'explication pour cet exercice.";

    tutorChatHistory.push({ role: "user", text: userText });
    tutorChatHistory.push({ role: "model", text: botReply });

    const formattedBotReply = formatMarkdownForChat(botReply);
    appendTutorMessage("bot", formattedBotReply);
    playBeep();
  } catch (err) {
    const loadingEl = document.getElementById(loadingMsgId);
    if (loadingEl && loadingEl.parentElement) {
      loadingEl.parentElement.parentElement.remove();
    }
    appendTutorMessage("bot", `❌ <b>Erreur réseau</b> : ${err.message}`);
  }
}

export function toggleTutorVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("La reconnaissance vocale n'est pas supportée par votre navigateur.");
    return;
  }

  const btn = document.getElementById("btnTutorVoice");

  if (isTutorListening) {
    if (tutorSpeechRecognition) {
      try {
        tutorSpeechRecognition.stop();
      } catch (e) {}
    }
    isTutorListening = false;
    if (btn) btn.style.color = "";
  } else {
    try {
      tutorSpeechRecognition = new SpeechRecognition();
      tutorSpeechRecognition.lang = "ar-TN";
      tutorSpeechRecognition.interimResults = true;
      tutorSpeechRecognition.continuous = false;

      tutorSpeechRecognition.onstart = function () {
        isTutorListening = true;
        if (btn) btn.style.color = "#ef4444";
      };

      tutorSpeechRecognition.onresult = function (event) {
        let text = "";
        for (let i = 0; i < event.results.length; i++) {
          text += event.results[i][0].transcript;
        }
        const textInp = document.getElementById("tutorTextInput");
        if (textInp) textInp.value = text;
      };

      tutorSpeechRecognition.onerror = function () {
        isTutorListening = false;
        if (btn) btn.style.color = "";
      };

      tutorSpeechRecognition.onend = function () {
        isTutorListening = false;
        if (btn) btn.style.color = "";
      };

      tutorSpeechRecognition.start();
    } catch (e) {
      console.error(e);
    }
  }
}

function formatUserMessageText(text) {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

function formatMarkdownForChat(text) {
  let html = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Code blocks ```...```
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, function (match, lang, code) {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code `...`
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold **...**
  html = html.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");

  // Italic *...*
  html = html.replace(/\*([^*]+)\*/g, "<i>$1</i>");

  // Newlines
  html = html.replace(/\n/g, "<br>");

  return html;
}

// Global Window Bindings
window.openTutorChat = openTutorChat;
window.closeTutorChat = closeTutorChat;
window.sendTutorMessage = sendTutorMessage;
window.handleTutorPhotoSelect = handleTutorPhotoSelect;
window.clearTutorAttachedPhoto = clearTutorAttachedPhoto;
window.clearTutorChatHistory = clearTutorChatHistory;
window.useTutorQuickPrompt = useTutorQuickPrompt;
window.toggleTutorVoice = toggleTutorVoice;
