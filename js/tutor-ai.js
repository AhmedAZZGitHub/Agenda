// js/tutor-ai.js
// Tuteur IA Éducatif Gemini Pro (Baccalauréat Tunisien) & Correction d'Exercices par Photo

import { getAiModelName, getAiApiKey, cleanDuplicateWords, mergeTranscripts, VoiceTranscriber } from "./ai-assistant.js?v=18.8";
import { state, showLoading, hideLoading } from "./state.js?v=18.8";
import { ARABIC_METHODOLOGY_KNOWLEDGE } from "./arabic-knowledge.js";

let tutorChatHistory = [];
let tutorAttachedImageBase64 = null;
let tutorAttachedImageMime = "image/jpeg";
let isTutorListening = false;
let tutorVoiceTranscriber = null;

const TUTOR_SYSTEM_INSTRUCTION = `Tu es "Tuteur Bac IA", un professeur particulier d'élite et tuteur bienveillant dédié exclusivement aux élèves préparant le Baccalauréat (notamment le Baccalauréat Tunisien pour toutes les sections : Mathématiques, Sciences Expérimentales, Informatique, Économie et Gestion, Technique, Lettres et Sport).

RÈGLES STRICTES ET NON NÉGOCIABLES :
1. PÉRIMÈTRE STRICTEMENT ÉDUCATIF : Tu réponds UNIQUEMENT aux questions scolaires et pédagogiques :
   - Mathématiques (Analyse, Géométrie dans l'espace, Nombres Complexes, Arithmétique, Probabilités...)
   - Sciences Physiques (Chimie, Électricité, Mécanique, Ondes, Nucléaire...)
   - Sciences de la Vie et de la Terre (SVT)
   - Informatique & Algorithmique (Python, SQL, HTML/CSS/JS, algorithmes récursifs et itératifs...)
   - Philosophie (Méthode de dissertation, commentaire, notions du programme...)
   - Langues (Arabe, Français, Anglais, Italien, Espagnol, Allemand)
   - Économie & Gestion (Micro/Macro, Comptabilité, Gestion financière...)
   - Sciences Techniques (Génie Électrique, Génie Mécanique...)
   - Méthodologie d'apprentissage, gestion du temps et organisation des révisions du Bac.

2. REFUS DES SUJETS HORS-PROGRAMME :
   Si l'élève te pose une question non éducative (ex: jeux vidéo, divertissement, potins, sujets politiques ou sans rapport avec l'apprentissage scolaire), refuse poliment et avec humour ou bienveillance, en français ou en dialecte tunisien (Derja), et réoriente immédiatement vers une révision du Bac.
   Exemple : "Je suis ton Tuteur Bac IA dédié à 100% à ta réussite scolaire ! 🎓 Pose-moi une question sur tes cours (Maths, Physique, SVT, Info, Philo, Arabe...) ou envoie-moi une photo d'exercice à corriger."

3. CORRECTION D'EXERCICES ET DEVOIRS (PAR PHOTO OU TEXTE) :
   Lorsque l'élève t'envoie une photo d'énoncé ou de son travail manuscrit :
   - Étape 1 : Identifie le chapitre et l'objectif de l'exercice.
   - Étape 2 : Si l'élève a inclus sa tentative/brouillon, repère avec précision les erreurs et explique pourquoi.
   - Étape 3 : Rédige la solution complète, étape par étape, claire et rigoureuse selon les exigences officielles du Bac.
   - Étape 4 : Donne une astuce clé ("Conseil Bac / Barème") pour éviter les pièges classiques.

4. RÈGLE STRICTE ET ABSOLUE POUR LA MATIÈRE ARABE (المرجع الحصري لمادة ومحاور العربية) :
   - Pour toute question portant sur la matière Arabe (دراسة النص، أسئلة الفهم، التلخيص، التفسير، الحجاج، التوسع، إبداء الرأي، التنسيب، دلالة الأدوات، أنواع الحجج، ومحاور: التفكير العلمي، الفن والأدب، حوار الحضارات، الفكر والفن) :
   - Tu DOIS T'APPUYER STRICTEMENT ET EXCLUSIVEMENT sur la méthodologie officielle et les cours numérisés du dossier de référence "منهجية ومحاور العربية" (fournis ci-dessous).
   - N'UTILISE AUCUNE MÉTHODOLOGIE EXTERNE NON CONFORME. Utilise rigoureusement les termes officiels du Baccalauréat tunisien (الأطروحة المدعومة، الأطروحة المدحوضة، سيرورة الحجاج، الاستنتاج، الإجمال والتفصيل، التنسيب بالتعديل، التنسيب بالإضافة، الشواهد الرسمية للعلماء والأدباء).

5. TONE & FORMAT :
   - Sois encourageant, clair, pédagogique et structuré (titres en gras, puces, étapes numérotées, tableaux comparatifs).
   - Tu comprends parfaitement le français, l'arabe littéraire et le dialecte tunisien (Derja / Arabizi). Pour les questions d'arabe, réponds en arabe littéraire soigné et structuré selon les standards du Bac tunisien.`;

export function getTutorModelName() {
  const saved = localStorage.getItem("gemini_model_name");
  if (saved && saved.trim()) return saved.trim();
  return "gemini-3.1-pro"; // Modèle Google Gemini 3.1 Pro par défaut exigé
}

export async function promptSetAiApiKey() {
  const currentKey = localStorage.getItem("gemini_api_key") || "";
  const key = prompt(
    "🔑 Clé API Google Gemini (AI Studio) :\n\nPour connecter directement l'Intelligence Artificielle en direct, collez votre clé API Google (obtenue gratuitement sur https://aistudio.google.com/app/apikey) :",
    currentKey
  );
  if (key === null) return;

  const trimmed = key.trim();
  if (!trimmed) {
    localStorage.removeItem("gemini_api_key");
    alert("ℹ️ Clé réinitialisée.");
    return;
  }

  showLoading("Vérification de votre clé auprès des serveurs Google Gemini...");
  try {
    const candidateModels = [
      "gemini-1.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-pro"
    ];
    let testSuccess = false;
    let lastError = "";

    for (const m of candidateModels) {
      const endpoints = ["v1beta", "v1"];
      for (const apiVer of endpoints) {
        try {
          const testUrl = `https://generativelanguage.googleapis.com/${apiVer}/models/${m}:generateContent?key=${trimmed}`;
          const resp = await fetch(testUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: "Bonjour" }] }] }),
          });
          if (resp.ok) {
            testSuccess = true;
            break;
          } else {
            const errData = await resp.json().catch(() => ({}));
            lastError = errData.error?.message || `Erreur HTTP ${resp.status}`;
          }
        } catch (err) {
          lastError = err.message;
        }
      }
      if (testSuccess) break;
    }

    hideLoading();
    if (testSuccess) {
      localStorage.setItem("gemini_api_key", trimmed);
      alert("🎉 Clé Google Gemini validée avec succès !\n\nLe Tuteur IA et le Micro IA sont désormais connectés en direct aux serveurs de Google pour répondre à toutes vos questions.");
      renderTutorWelcomeMessage();
    } else {
      const forceSave = confirm(`⚠️ Erreur de validation de la clé :\n${lastError}\n\nGoogle n'arrive pas à valider les modèles avec cette clé. Voulez-vous forcer l'enregistrement de cette clé quand même ?`);
      if (forceSave) {
        localStorage.setItem("gemini_api_key", trimmed);
        alert("✅ Clé enregistrée de force.");
        renderTutorWelcomeMessage();
      }
    }
  } catch (e) {
    hideLoading();
    alert("Erreur de connexion : " + e.message);
  }
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
    modelBadge.innerText = "✨ Gemini 3.1 Pro";
  }

  // Nettoyage automatique des anciens messages d'erreur résiduels
  const msgContainer = document.getElementById("tutorChatMessages");
  if (msgContainer && (msgContainer.innerHTML.includes("404") || msgContainer.innerHTML.includes("gemini-3.1") || tutorChatHistory.length === 0)) {
    tutorChatHistory = [];
    msgContainer.innerHTML = "";
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

  let botReply = "";

  try {
    const candidateModels = [
      "gemini-3.1-pro",
      "gemini-3.7-flash",
      "gemini-3.6-flash",
      "gemini-3.0-pro",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-1.5-pro",
      "gemini-1.5-flash"
    ];
    let apiSuccess = false;
    let lastErrorStatus = null;

    const parts = [];

    if (attachedBase64) {
      parts.push({
        inlineData: {
          mimeType: attachedMime,
          data: attachedBase64,
        },
      });
    }

    const isArabicRelated = /[\u0600-\u06FF]|arabe|arabia|manhajya|منهجية|حجاج|تفسير|تلخيص|شواهد|أطروحة|تنسيب|توسع|ابن خلدون|ابن الهيثم|الجاحظ|المعري|التوحيدي|لوبون|حضارات/i.test(userText);

    let contextualInstruction = TUTOR_SYSTEM_INSTRUCTION;
    if (isArabicRelated) {
      contextualInstruction += `\n\n--- 📖 BASE DE CONNAISSANCES OFFICIELLE 'MANHAJYA ARABIA' DU BACCALAURÉAT TUNISIEN (À RESPECTER STRICTEMENT SANS AUCUNE SOURCE EXTERNE) ---\n${ARABIC_METHODOLOGY_KNOWLEDGE}\n`;
    }

    const fullPrompt = `${contextualInstruction}

SECTION DE L'ÉLÈVE : ${state.currentUserProfile?.section || "Toutes sections"}

HISTORIQUE RÉCENT :
${tutorChatHistory.slice(-4).map((h) => `${h.role === "user" ? "Élève" : "Tuteur"}: ${h.text}`).join("\n")}

MESSAGE / QUESTION DE L'ÉLÈVE :
"${userText || "Voici l'image de mon exercice. Corrige-le et explique la méthode pas à pas."}"`;

    parts.push({ text: fullPrompt });

    for (const mName of candidateModels) {
      const endpoints = ["v1beta", "v1"];
      for (const apiVer of endpoints) {
        try {
          const url = `https://generativelanguage.googleapis.com/${apiVer}/models/${mName}:generateContent?key=${apiKey}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts }] }),
          });

          if (res.ok) {
            const data = await res.json();
            botReply = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (botReply) {
              apiSuccess = true;
              break;
            }
          } else {
            lastErrorStatus = res.status;
          }
        } catch (err) {
          console.warn(`Erreur lors de l'appel modèle ${mName} (${apiVer}):`, err);
        }
      }
      if (apiSuccess) break;
    }
  } catch (e) {
    console.warn("API Gemini non accessible:", e);
  }

  const loadingEl = document.getElementById(loadingMsgId);
  if (loadingEl && loadingEl.parentElement) {
    loadingEl.parentElement.parentElement.remove();
  }

  if (!botReply) {
    const hasCustomKey = Boolean(localStorage.getItem("gemini_api_key"));
    if (!hasCustomKey) {
      botReply = `⚠️ **Connexion à Google Gemini Pro requise pour les réponses libres en direct**

Pour poser n'importe quelle question et recevoir les explications complètes générées en direct par **Google Gemini Pro** :
1. Cliquez sur le bouton bleu **🔑 Clé IA** en haut à droite.
2. Collez votre clé gratuite obtenue sur **[aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)**.

---
` + generateBuiltInPedagogicalResponse(userText, attachedBase64, state.currentUserProfile?.section);
    } else {
      botReply = generateBuiltInPedagogicalResponse(userText, attachedBase64, state.currentUserProfile?.section);
    }
  }

  tutorChatHistory.push({ role: "user", text: userText });
  tutorChatHistory.push({ role: "model", text: botReply });

  const formattedBotReply = formatMarkdownForChat(botReply);
  appendTutorMessage("bot", formattedBotReply);
}

// Moteur Pédagogique Spécialisé Baccalauréat (Réponses précises par notion)
function generateBuiltInPedagogicalResponse(text, hasImage, section = "Toutes sections") {
  const query = (text || "").toLowerCase().trim();

  // 1. Salutations et Derja / Arabizi
  if (!query || query.match(/^(ahla|ahlan|salam|salut|bonjour|coucou|hi|hello|3aslema|aslema|labes|cv|sbe7|sbah|sba7)$/i)) {
    const name = state.currentUserProfile?.displayName || "futur bachelier";
    return `**3aslema ${name} ! Ahla bik !** 🎓✨

Je suis ton **Tuteur IA Éducatif** dédié à ta réussite au **Baccalauréat (${section})**.

Pose-moi une question sur ton cours de Maths, Physique, SVT, Info ou Philo, ou clique sur **📷** pour corriger un exercice !`;
  }

  // 2. Question sur le nombre e / exponentielle
  if (query.includes("e en math") || query.includes("nombre e") || query.includes("c'est quoi e") || query.includes("valeur de e") || query.includes("exponentiel") || query.includes("exp(")) {
    return `### 📐 Le Nombre $e$ (Constante d'Euler) en Mathématiques

En mathématiques, **$e$** est une constante fondamentale irrationnelle dont la valeur approchée est :
$$e \\approx 2{,}71828...$$

#### 🔹 1. Définition et Origine :
* **Base du logarithme népérien** : C'est le nombre unique tel que $\\ln(e) = 1$.
* **Fonction Exponentielle** : C'est la base de la fonction exponentielle notée $\\exp(x) = e^x$.

#### 🔹 2. Propriété Fondamentale :
La fonction $f(x) = e^x$ est la seule fonction dérivable sur $\\mathbb{R}$ qui est **égale à sa propre dérivée** avec $f(0) = 1$ :
$$(e^x)' = e^x \\quad \\text{et} \\quad e^0 = 1$$

#### 🔹 3. Propriétés Algébriques au Bac :
* $e^{a+b} = e^a \\cdot e^b$
* $e^{-a} = \\frac{1}{e^a}$
* $e^{a-b} = \\frac{e^a}{e^b}$
* Pour tout $x \\in \\mathbb{R}$, $e^x > 0$ (strictement positif).`;
  }

  // 3. Logarithme népérien
  if (query.includes("log") || query.includes("ln(") || query.includes("ln ") || query.includes("neperien")) {
    return `### 📐 Fonction Logarithme Népérien $\\ln(x)$

* **Domaine de définition** : $\\left]0, +\\infty\\right[$.
* **Valeurs clés** : $\\ln(1) = 0$ et $\\ln(e) = 1$.
* **Dérivée** : $(\\ln(x))' = \\frac{1}{x}$ et $(\\ln(u))' = \\frac{u'}{u}$.
* **Propriétés algébriques** :
  * $\\ln(a \\cdot b) = \\ln(a) + \\ln(b)$
  * $\\ln\\left(\\frac{a}{b}\\right) = \\ln(a) - \\ln(b)$
  * $\\ln(a^n) = n \\ln(a)$
* **Limites usuelles** :
  * $\\lim_{x \\to 0^+} \\ln(x) = -\\infty$
  * $\\lim_{x \\to +\\infty} \\frac{\\ln(x)}{x} = 0$ (Croissance comparée)`;
  }

  // 4. Nombres complexes
  if (query.includes("complexe") || query.includes("forme trigo") || query.includes("affixe") || query.includes("module") || query.includes("argument")) {
    return `### 📐 Nombres Complexes au Bac

* **Forme algébrique** : $z = a + ib$ (avec $i^2 = -1$).
* **Module** : $|z| = \\sqrt{a^2 + b^2}$.
* **Forme trigonométrique / exponentielle** :
  $$z = r(\\cos\\theta + i\\sin\\theta) = r e^{i\\theta}$$
  où $r = |z|$ et $\\cos\\theta = \\frac{a}{r}$, $\\sin\\theta = \\frac{b}{r}$.
* **Interprétation géométrique** :
  * Affixe du vecteur $\\vec{AB}$ : $z_{\\vec{AB}} = z_B - z_A$.
  * Distance : $AB = |z_B - z_A|$.
  * Angle : $(\\vec{u}, \\vec{AB}) \\equiv \\arg(z_B - z_A) \\pmod{2\\pi}$.`;
  }

  // 5. Théorème des Valeurs Intermédiaires (TVI)
  if (query.includes("tvi") || query.includes("valeur intermediaire") || query.includes("bijection") || query.includes("unique solution")) {
    return `### 📐 Théorème des Valeurs Intermédiaires (TVI) & Corollaire

#### 📌 Énoncé du Corollaire (Stricte Monotonie) :
Soit $f$ une fonction définie sur un intervalle $[a, b]$. Si :
1. $f$ est **continue** sur $[a, b]$.
2. $f$ est **strictement monotone** (croissante ou décroissante) sur $[a, b]$.

Alors, pour tout réel $k$ compris entre $f(a)$ et $f(b)$, l'équation $f(x) = k$ admet une **unique solution** $\\alpha \\in [a, b]$.

💡 **Rédaction Type Bac** : Toujours vérifier et mentionner explicitement les deux hypothèses (Continuité + Stricte monotonie) sur votre copie !`;
  }

  // 6. Dérivées et Primitives
  if (query.includes("derive") || query.includes("primitive") || query.includes("integrale")) {
    return `### 📐 Dérivées et Primitives Usuelles

| Fonction $f(x)$ | Dérivée $f'(x)$ | Primitive $F(x)$ |
| :--- | :--- | :--- |
| $x^n$ ($n \\neq -1$) | $n x^{n-1}$ | $\\frac{x^{n+1}}{n+1}$ |
| $\\frac{1}{x}$ | $-\\frac{1}{x^2}$ | $\\ln|x|$ |
| $e^u$ | $u' e^u$ | $e^u$ (si $u'e^u$) |
| $\\ln(u)$ | $\\frac{u'}{u}$ | $u\\ln(u) - u$ |
| $\\sqrt{u}$ | $\\frac{u'}{2\\sqrt{u}}$ | $\\frac{2}{3}u\\sqrt{u}$ (si $u'\\sqrt{u}$) |`;
  }

  // 7. Physique : Circuit RLC / RC / RL
  if (query.includes("rlc") || query.includes("circuit rc") || query.includes("condensateur") || query.includes("bobine") || query.includes("energie")) {
    return `### 🔬 Sciences Physiques : Dipôles $RC$, $RL$ et $RLC$

* **Dipôle RC (Charge)** : $\\tau = RC$, $u_C(t) = E(1 - e^{-t/\\tau})$. À $t = \\tau$, $u_C = 0{,}63 E$.
* **Dipôle RL (Établissement)** : $\\tau = \\frac{L}{R_t}$, $i(t) = I_0(1 - e^{-t/\\tau})$.
* **Circuit RLC libre amorti** :
  $$\\frac{d^2 u_C}{dt^2} + \\frac{R_t}{L} \\frac{du_C}{dt} + \\frac{1}{LC} u_C = 0$$
  * Période propre : $T_0 = 2\\pi\\sqrt{LC}$.
  * Énergie totale : $E_{tot} = \\frac{1}{2} C u_C^2 + \\frac{1}{2} L i^2$.`;
  }

  // 8. Informatique / Python
  if (query.includes("python") || query.includes("algo") || query.includes("tri") || query.includes("recursiv") || query.includes("sql")) {
    return `### 💻 Informatique & Algorithmique Bac

#### 🔹 Tri à Bulles (Python) :
\`\`\`python
def tri_bulles(T):
    n = len(T)
    for i in range(n - 1):
        for j in range(n - 1 - i):
            if T[j] > T[j + 1]:
                T[j], T[j + 1] = T[j + 1], T[j]
    return T
\`\`\`

#### 🔹 Requête SQL Type :
\`\`\`sql
SELECT nom, section, moyenne
FROM Eleves
WHERE moyenne >= 10
ORDER BY moyenne DESC;
\`\`\``;
  }

  // 9. MATIÈRE ARABE : Méthodologie et المحاور الرسمية للباكالوريا (Issu du dossier de référence 'manhajya arabia')
  if (query.includes("تلخيص") || query.includes("resume") || query.includes("résumé")) {
    return `### 📝 منهجية التلخيص في امتحان البكالوريا (منهجية رسمية)

#### 🔹 1. المراحل الأساسية :
1. **القراءة الفاحصة** : تحديد أطروحة النص وبنيته المنطقية والتمييز بين الأفكار الرئيسية والأفكار الفرعية.
2. **حذف الشوائب والحشو** :
   * حذف الأمثلة والشواهد المطولة والتفاصيل الفرعية.
   * حذف الاستطرادات والتكرار والمترادفات الزائدة.
3. **إعادة الصياغة بأسلوبك الخاص** :
   * الحفاظ على التدرج المنطقي للنص وموقف الكاتب دون تحريف.
   * الالتزام الصارم بالحجم المطلوب (**بين 4 و 6 أسطر** أو ربع النص).

#### ⚠️ محاذير يُمنع ارتكابها :
* ❌ تجنب البدء بعبارات مثل : *"يتحدث الكاتب عن..."* أو *"يقول صاحب النص..."*.
* ❌ يُمنع نسخ جمل النص حرفياً.
* ❌ يُمنع إبداء الرأي الشخصي أو التعليق على الأفكار.`;
  }

  if (query.includes("حجاج") || query.includes("تفسير") || query.includes("الفرق بين النص")) {
    return `### ⚖️ مقارنة منهجية : النص الحجاجي vs النص التفسيري

| المعيار | النص الحجاجي | النص التفسيري |
| :--- | :--- | :--- |
| **موضوع النص** | مبحث **خلافي** يطرح تبايناً في الآراء والمواقف. | مبحث **ثابت** ومقرر (غامض أو مجهول للمتلقي). |
| **طرفا الخطاب** | **مُحاجّ** (صاحب موقف) ⬅️ **مَحجوج** (غير مقتنع/خصم). | **مُفسِّر** (عالم بالمبحث) ⬅️ **مُفَسَّر له** (أقل علماً). |
| **البنية المنطقية** | أطروحة (مدعومة/مدحوضة) ⬅️ سيرورة الحجاج ⬅️ استنتاج. | إجمال (عرض) ⬅️ تفصيل (توسع) ⬅️ استنتاج/تكثيف. |
| **المقصد** | **الإقناع** وتعديل موقف المتلقي. | **الإفهام والتوضيح** والتعليم والتبسيط. |

#### 🔹 أنواع الخطط الحجاجية :
1. **خطة الدعم** : أطروحة مدعومة + حجج تدعيم + استنتاج تأكيدي.
2. **خطة الدحض** : أطروحة مدحوضة + حجج إبطال + أطروحة بديلة + استنتاج.
3. **خطة المسايرة والتنسيب** : مسايرة جزئية + تنسيب بالاستدراك (*لكن / غير أن*) + إثبات الموقف الحقيقي.`;
  }

  if (query.includes("حجج") || query.includes("انواع الحجج") || query.includes("أنواع الحجج") || query.includes("حجة")) {
    return `### 🔍 أنواع الحجج ودلالاتها في سياق الحجاج (مرجع البكالوريا)

1. **الحجة القولية (حجة السلطة)** : الاستشهاد بأقوال الفلاسفة والعلماء والكتّاب ⬅️ *دلالتها : إكساب الأطروحة مصداقية ومحاصرة الخصم بسلطة العارفين*.
2. **الحجة التاريخية** : استدعاء وقائع وأحداث ماضية ⬅️ *دلالتها : تأكيد صحة الفكرة بالتجربة التاريخية الثابتة*.
3. **حجة الواقع / بالمثال** : نماذج ملموسة من الواقع المعاش ⬅️ *دلالتها : تقريب الفكرة للأذهان وتأكيد واقعيتها*.
4. **حجة المماثلة والقياس** : تشبيه مجال معلوم بآخر غامض ⬅️ *دلالتها : تيسير الإقناع بالقياس المنطقي*.
5. **حجة المقارنة والمفاضلة** : المقارنة بين حالتين لإبراز التفاوت ⬅️ *دلالتها : ترجيح موقف وإظهار مكامن الخلل*.
6. **الحجة العلمية / الإحصائية** : أرقام، نسب مئوية، قوانين مخبرية ⬅️ *دلالتها : إضفاء طابع قطعي حاسم لا يقبل الشك*.
7. **حجة الحد / التعريف** : ضبط المفاهيم بدقة ⬅️ *دلالتها : تأطير النقاش ومنع اللبس وسوء الفهم*.`;
  }

  if (query.includes("أدوات") || query.includes("روابط") || query.includes("دلالة الأدوات")) {
    return `### 🔗 دلالة الأدوات والروابط في الحجاج والتفسير

* **التأكيد** : (*إنّ، أنّ، لقد، قد + ماضٍ، لا مراء، لا ريب*) ⬅️ تثبيت الحكم وترسيخه ونفي التردد.
* **النفي والدحض** : (*ليس، لم، لن، ما... بل، إنما*) ⬅️ إبطال الأطروحة الخصمة ودحض حججها.
* **الاستدراك والتعارض** : (*لكن، غير أنّ، بيد أنّ، في المقابل*) ⬅️ تنسيب الحكم والاحتراز وطرح البديل.
* **الحصر** : (*إنما، ما... إلا، لا... سوى*) ⬅️ قصر الحكم على الموصوف وتأكيد فرادته.
* **التعليل** : (*لأنّ، إذ، بما أنّ، نظراً لـ*) ⬅️ بناء العلاقة المنطقية بين السبب والنتيجة.
* **التفسير والتفصيل** : (*أي، أعني، والمقصود بذلك، أما... فـ*) ⬅️ توضيح الغامض وتفكيك المعنى الإجمالي.
* **الاستنتاج** : (*إذن، هكذا، بناءً عليه، ومجمل القول*) ⬅️ استخلاص الحصيلة وتتويج المسار المنطقي.`;
  }

  if (query.includes("تفكير علمي") || query.includes("التفكير العلمي") || query.includes("ابن الهيثم") || query.includes("ابن سينا") || query.includes("الرازي") || query.includes("المحور الاول") || query.includes("المحور الأول")) {
    return `### 🔬 المحور الأول : في التفكير العلمي عند العرب

#### 🔹 1. عوامل الازدهار :
* **ديني** : دعوة القرآن لطلب العلم وإعمال العقل ("طلب العلم فريضة").
* **سياسي** : رعاية الخلفاء وتشجيعهم (بناء **بيت الحكمة ببغداد** و**دار الحكمة بالقاهرة**، ورصد الذهب للمترجمين).
* **حضاري واجتماعي** : التفاعل مع الأمم الأخرى (اليونان، الفرس، الهند) والانتقال إلى التمدن والاستقرار.

#### 🔹 2. مراحل التفكير العلمي :
1. **النقل والاستيعاب** (الترجمة وحفظ التراث الإنساني).
2. **النقد والتصحيح** (رفض التسليم الأعمى وتصحيح أخطاء القدماء كأرسطو وبطليموس وجالينوس).
3. **الإضافة والتأسيس** (ابتكار علوم جديدة كالجبر والمناظر والمنهج التجريبي).

#### 🔹 3. أبرز الأعلام والشواهد :
* **الحسن بن الهيثم** : مؤسس علم المناظر والمنهج التجريبي (*"الواجب على من ينظر في كتب العلماء أن يجعل نفسه خصماً لكل ما ينظر فيه"*).
* **أبو بكر الرازي** : رائد الطب التجريبي، أول من استعمل خيوط الجراحة من مصارين الحيوان (كتاب *الحاوي*).
* **ابن سينا** : أول من استعمل التخدير بالاستنشاق واكتشف طفيل الإنكلستوما (كتاب *القانون في الطب*).
* **ابن النفيس** : مكتشف الدورة الدموية الصغرى.
* **الزهراوي** : مؤسس الجراحة الحديثة (كتاب *التصريف لمن عجز عن التأليف*).
* **الخوارزمي** : مؤسس علم الجبر ومبتكر الصفر والأرقام الخوارزمية.
* **ابن خلدون** : مؤسس علم الاجتماع والعمران البشري والتاريخ العلمي (*المقدمة*).
* **شاهد المستشرق غوستاف لوبون** : *"إن العرب هم الذين مدّنوا أوروبا، وإن ما نقلوه وأضافوه كان فجر النهضة الغربية الحديثة"*`;
  }

  if (query.includes("حوار الحضارات") || query.includes("حضارات") || query.includes("المحور الثالث")) {
    return `### 🌐 المحور الثالث : في حوار الحضارات

#### 🔹 1. المفهوم والدواعي :
* **المفهوم** : التبادل، التلاقح والتفاعل الثقافي القائم على الندية والتكافؤ.
* **الدواعي** : ترابط المصالح، مواجهة الأخطار المشتركة (الأوبئة، التغير المناخي، الفقر، الإرهاب، الحروب)، وإشاعة السلام العادل.

#### 🔹 2. شروط الحوار الفعال :
1. **الاعتراف بالآخر** وحقه في الاختلاف والتعددية.
2. **الندية والتكافؤ** ونبذ النزعة المركزية والاستعلاء والهيمنة.
3. **الحفاظ على الهوية والخصوصية** : انفتاح واعي دون ذوبان أو استلاب ثقافي.
4. **التسامح والإنصاف** ونبذ الأحكام المسبقة والصور النمطية.

#### 🔹 3. تباين المواقف من الحوار :
* **الموقف الرافض (الانعزالي)** : الخوف من طمس الهوية والغزو الثقافي (يؤدي إلى التقوقع والتخلف والتحجر).
* **الموقف الداعي للحوار** : الإيمان بأن الحضارة إرث مشترك وأن التقدم لا يتحقق إلا بالتلاقح والتفاعل الإيجابي.
* **عوائق الحوار** : موصولة بالذات (الانغلاق، عقدة النقص أو الغرور) وموصولة بالآخر (الهيمنة، التنميط، وازدواجية المعايير).`;
  }

  if (query.includes("الفن والأدب") || query.includes("فن وأدب") || query.includes("الجاحظ") || query.includes("المقفع") || query.includes("المحور الثاني")) {
    return `### 🎨 المحور الثاني : في الفن والأدب عند العرب قديماً

#### 🔹 1. الشعر العربي ووظائفه :
* ديوان العرب وسجل مفاخرهم وتاريخهم ووسيلة الارتقاء بالذوق الوجداني.
* **مظاهر التجديد** : استحدثت أغراض جديدة (الغزل الحضري، الزهد، وصف الطبيعة، رثاء المدن)، وتطور المعجم الشعري.
* **أعلامه** : امرؤ القيس، عنترة، طرفة، عمر بن أبي ربيعة، أبو نواس، المتنبي.

#### 🔹 2. النثر العربي (بين لذة القراءة ولذعة النقد) :
* **عبد الله بن المقفع (*كليلة ودمنة*)** : الحكاية المثلية الرمزية على ألسنة الحيوان لتقديم النصح السياسي ونقد الاستبداد.
* **الجاحظ (*البخلاء*، *البيان والتبيين*)** : الجمع بين الإمتاع والمؤانسة، والسخرية الهادفة لنقد العيوب الاجتماعية كالبخل والنفاق.
* **أبو العلاء المعري (*رسالة الغفران*)** : رحلة خيالية للآخرة لمساءلة قضايا الفكر والدين واللغة.
* **أبو حيان التوحيدي (*الإمتاع والمؤانسة*)** : المطارحات العقلية والأدبية وتصوير واقع المجتمع والمثقفين.
* **ابن حزم الأندلسي (*طوق الحمامة*)** : التحليل النفسي لعواطف الحب ومشاعر النفس البشرية.
* **بديع الزمان الهمذاني (*المقامات*)** : الجمع بين البلاغة والسجع والنقد الاجتماعي عبر الكدية والحيلة.

#### 🔹 3. الفنون الإسلامية :
* **العمارة** : المساجد (القيروان، الأموي) والقصور (الحمراء).
* **الخط والزخرفة (الأرابيسك)** : التجريد والجمال اللانهائي.
* **الموسيقى والغناء** : إبداعات زرياب (الوتر الخامس) ونظريات الفارابي.`;
  }

  if (query.includes("الفكر والفن") || query.includes("فكر وفن") || query.includes("العولمة") || query.includes("الديمقراطية") || query.includes("المحور الرابع")) {
    return `### 💡 المحور الرابع : في الفكر والفن المعاصر

#### 🔹 1. شواغل الفكر المعاصر :
* **الديمقراطية** :
  * *مزاياها* : تكريس المواطنة، التداول السلمي للسلطة، العدالة الاجتماعية، وصيانة الحريات.
  * *عوائقها* : الاستبداد، الفساد، التهميش، وتفريغ الديمقراطية من محتواها الحقيقي.
* **الحرية** : كسر قيود الخوف والاستبداد وإطلاق الطاقات الإبداعية.
* **العولمة** :
  * *إيجابياتها* : سرعة تداول المعلومات وإلغاء المسافات وتسهيل التواصل.
  * *سلبياتها* : طمس الهويات، الهيمنة الاقتصادية، وتعميق الفقر والنزعة الاستهلاكية.
* **العلم والتكنولوجيا** :
  * *الوجه المشرق* : علاج الأمراض، تيسير الحياة، وتحقيق الرفاهية.
  * *الوجه القاتم* : أسلحة الدمار الشامل، التلوث، الاستلاب الرقمي والتبعية للآلة.

#### 🔹 2. وظائف الفنون المعاصرة :
* **المسرح** : *"أعطني مسرحاً أعطك شعباً عظيماً"* (أداة التوعية والتثقيف والنقد المباشر).
* **السينما** : الفن السابع، قوة الصورة في التأثير والتوثيق لقضايا الإنسان.
* **الموسيقى والشعر الحديث** : التعبير عن آلام الشعوب والتطلع للحرية (الشابي، درويش، نزار قباني).`;
  }

  if (query.includes("ابداء الرأي") || query.includes("إبداء الرأي") || query.includes("تنسيب") || query.includes("توسع")) {
    return `### ✍️ منهجية إبداء الرأي والفقرة الحجاجية (ص 14 وص 19)

#### 🔹 1. أسلوب التنسيب بالتعديل :
* **المسايرة أولاً** : الاعتراف بوجاهة فكرة النص في سياق معين (*"لا شك أن الكاتب محق حين..."*).
* **التعديل والتنسيب** : الاستدراك وتبيان حدود الفكرة ونقاط القصور فيها (*"غير أن الاقتصار على هذا الرأي يغفل أن..."*).
* **الاستنتاج** : صياغة موقف تركيبي متوازن.

#### 🔹 2. أسلوب التنسيب بالإضافة :
* **المسايرة والتدعيم** : الإقرار بصحة الفكرة ودعمها بحجة أو شاهد.
* **الإضافة** : إضافة أبعاد وعوامل مكملة لم يتطرق إليها النص (*"وفضلاً عن ذلك، يتعين الانتباه إلى..."*).
* **الاستنتاج** : تلخيص الرؤية الشاملة.

#### 🔹 3. هيكل الفقرة النموذجي (12 - 15 سطراً) :
1. **مقدمة مقتضبة** : مدخل دقيق وتأطير للإشكالية.
2. **الجوهر** : فكرتان رئيسيتان مدعمتان بحجتين وشاهدين (شاهد قولي أو مثال واقعي/تاريخي).
3. **الخاتمة** : استنتاج ختامي يفتح أفقاً جديداً.`;
  }

  // 10. Réponse d'accompagnement générale
  return `### 🎓 Tuteur Bac IA

Concernant votre question sur **"${text}"** :

* Cette notion est au programme officiel du Baccalauréat.
* Pour une démonstration complète, un calcul d'exercice ou une résolution pas-à-pas en direct :
  👉 Cliquez sur **[🔑 Clé IA]** en haut à droite pour connecter votre clé gratuite Google Gemini !

  Avez-vous une formule ou un énoncé précis sur cette notion ?`;
}

export function toggleTutorVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("La reconnaissance vocale n'est pas supportée par votre navigateur.");
    return;
  }

  const btn = document.getElementById("btnTutorVoice");
  const textInp = document.getElementById("tutorTextInput");

  if (isTutorListening) {
    if (tutorVoiceTranscriber) {
      tutorVoiceTranscriber.stop();
    }
    isTutorListening = false;
    if (btn) btn.style.color = "";
  } else {
    if (!tutorVoiceTranscriber) {
      tutorVoiceTranscriber = new VoiceTranscriber({
        lang: "ar-TN",
        onUpdate: (fullText) => {
          const inp = document.getElementById("tutorTextInput");
          if (inp) inp.value = fullText;
        },
        onStateChange: (listening) => {
          isTutorListening = listening;
          const b = document.getElementById("btnTutorVoice");
          if (b) {
            b.style.color = listening ? "#ef4444" : "";
            b.title = listening ? "🔴 Écoute active... Cliquez pour arrêter" : "Dicter votre message";
          }
        }
      });
    }
    tutorVoiceTranscriber.start(textInp ? textInp.value.trim() : "");
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
window.promptSetAiApiKey = promptSetAiApiKey;
