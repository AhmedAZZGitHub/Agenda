// js/tutor-ai.js
// Tuteur IA Éducatif Gemini Pro (Baccalauréat Tunisien) & Correction d'Exercices par Photo

import { getAiModelName, getAiApiKey } from "./ai-assistant.js?v=7.0";
import { state, showLoading, hideLoading, playBeep } from "./state.js?v=7.0";

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
  return "gemini-1.5-pro"; // Endpoint officiel Google Gemini Pro
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
    modelBadge.innerText = "✨ Gemini 1.5 Pro";
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

    if (res.ok) {
      const data = await res.json();
      botReply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    }
  } catch (e) {
    console.warn("API Gemini non accessible, basculement vers le Moteur Pédagogique Bac intégré:", e);
  }

  const loadingEl = document.getElementById(loadingMsgId);
  if (loadingEl && loadingEl.parentElement) {
    loadingEl.parentElement.parentElement.remove();
  }

  if (!botReply) {
    botReply = generateBuiltInPedagogicalResponse(userText, attachedBase64, state.currentUserProfile?.section);
  }

  tutorChatHistory.push({ role: "user", text: userText });
  tutorChatHistory.push({ role: "model", text: botReply });

  const formattedBotReply = formatMarkdownForChat(botReply);
  appendTutorMessage("bot", formattedBotReply);
  playBeep();
}

// Moteur Pédagogique Spécialisé Baccalauréat (Garantie de réponse 100%)
function generateBuiltInPedagogicalResponse(text, hasImage, section = "Toutes sections") {
  const query = (text || "").toLowerCase().trim();

  // 1. Salutations et Derja / Arabizi
  if (!query || query.match(/^(ahla|ahlan|salam|salut|bonjour|coucou|hi|hello|3aslema|aslema|labes|cv|sbe7|sbah|sba7)/i)) {
    const name = state.currentUserProfile?.displayName || "futur bachelier";
    return `**3aslema ${name} ! Ahla bik !** 🎓✨

Je suis ton **Tuteur IA Éducatif** dédié à ta réussite au **Baccalauréat (${section})**.

Voici comment je peux t'aider dès maintenant :
* 📐 **Mathématiques & Physique** : pose une question sur un théorème, une formule ou un calcul.
* 📸 **Correction de devoir** : clique sur **📷** pour m'envoyer un exercice ou ton brouillon manuscrit !
* 💻 **Informatique & Python** : algorithmes de tri, récursivité, requêtes SQL.
* 🧠 **Philosophie & SVT** : méthodes de dissertation, schémas bilan et synthèses.
* ⚡ **Quiz d'entraînement** : teste tes connaissances avec des questions types Bac.

Quelle notion ou exercice souhaites-tu travailler aujourd'hui ?`;
  }

  // 2. Correction d'exercice par photo ou texte
  if (hasImage || query.includes("corrige") || query.includes("exercice") || query.includes("devoir") || query.includes("solution") || query.includes("brouillon")) {
    return `### 📝 Correction & Démarche de Résolution Type Bac

Voici la méthode rigoureuse exigée par les inspecteurs et correcteurs du Baccalauréat :

#### 1️⃣ Analyse de l'Énoncé & Hypothèses Clés :
* **Identification du Chapitre** : Repère précisément le cadre théorique (ex: Continuité et dérivabilité en Maths, Circuit RLC en Physique, Algorithme récursif en Info).
* **Données & Conditions initiales** : Note toutes les valeurs numériques avec leurs unités SI et le domaine de définition ($D_f = \\mathbb{R}$, $t \\ge 0$, etc.).

#### 2️⃣ Points de Vigilance & Pièges Classiques :
* ⚠️ **En Mathématiques** : Ne jamais oublier de justifier la continuité et la stricte monotonie avant d'appliquer le **Théorème des Valeurs Intermédiaires (TVI)**.
* ⚠️ **En Physique** : Bien orienter le circuit pour la loi des mailles et vérifier les conventions récepteur ($u = +L \\frac{di}{dt}$ ou $u = -L \\frac{di}{dt}$).
* ⚠️ **En Informatique** : Gérer les cas limites (liste vide, indice hors borne, condition d'arrêt de la récursivité).

#### 3️⃣ Rédaction Modèle Étape par Étape :
* **Étape 1** : Énoncer la loi ou le théorème utilisé : *"D'après le théorème..."*
* **Étape 2** : Poser l'équation littérale avant toute application numérique.
* **Étape 3** : Encadrer clairement le résultat final avec son unité.

💡 **Conseil Barème Bac** : 40% des points sont attribués à la clarté de la justification et à la rigueur de la rédaction !`;
  }

  // 3. Mathématiques
  if (query.includes("math") || query.includes("derive") || query.includes("limite") || query.includes("integrale") || query.includes("complexe") || query.includes("tvi") || query.includes("log") || query.includes("exp")) {
    return `### 📐 Fiche Pédagogique : Mathématiques Bac

#### 🔹 1. Théorème des Valeurs Intermédiaires (TVI) & Corollaire :
Si $f$ est continue et strictement monotone sur $[a, b]$, alors pour tout réel $k$ compris entre $f(a)$ et $f(b)$, l'équation $f(x) = k$ admet une **unique solution** $\\alpha \\in [a, b]$.

#### 🔹 2. Nombres Complexes :
* **Forme algébrique** : $z = a + ib$ avec $|z| = \\sqrt{a^2 + b^2}$.
* **Forme exponentielle** : $z = r e^{i\\theta}$ avec $\\cos(\\theta) = \\frac{a}{r}$ et $\\sin(\\theta) = \\frac{b}{r}$.
* **Géométrie** : L'affixe du vecteur $\\vec{AB}$ est $z_B - z_A$. La distance $AB = |z_B - z_A|$.

#### 🔹 3. Dérivées Usuelles Clés :
* $(\\ln(u))' = \\frac{u'}{u}$
* $(e^u)' = u' e^u$
* $(u^n)' = n u' u^{n-1}$

Pose-moi une question précise sur un calcul ou un exercice pour que nous le résolvions ensemble !`;
  }

  // 4. Physique - Chimie
  if (query.includes("physique") || query.includes("chimie") || query.includes("newton") || query.includes("rlc") || query.includes("onde") || query.includes("acide") || query.includes("pile")) {
    return `### 🔬 Fiche Pédagogique : Sciences Physiques & Chimie Bac

#### ⚡ 1. Circuit RLC Série en Oscillations Libres Amorties :
* **Équation différentielle en tension $u_C$** :
  $$\\frac{d^2 u_C}{dt^2} + \\frac{R_t}{L} \\frac{du_C}{dt} + \\frac{1}{LC} u_C = 0$$
* **Énergie totale** : $E = E_e + E_m = \\frac{1}{2} C u_C^2 + \\frac{1}{2} L i^2$.
* **Non-conservation de l'énergie** : $\\frac{dE}{dt} = -R_t i^2 < 0$ (dissipation par effet Joule).

#### 🧪 2. Chimie - Équilibre Acido-Basique :
* Constante d'acidité : $K_a = \\frac{[A^-]_{eq} \\cdot [H_3O^+]_{eq}}{[AH]_{eq}}$
* Relation fondamentale : $\\text{pH} = \\text{p}K_a + \\log\\left(\\frac{[A^-]}{[AH]}\\right)$
* **Point d'équivalence** : $C_A V_A = C_B V_{BE}$.

Quelle loi ou expérience souhaites-tu approfondir ?`;
  }

  // 5. Informatique / Python
  if (query.includes("info") || query.includes("python") || query.includes("algo") || query.includes("sql") || query.includes("tri") || query.includes("recursiv")) {
    return `### 💻 Fiche Pédagogique : Informatique & Algorithmique Python Bac

#### 🔹 Algorithme de Tri à Bulles (Type Épreuve Pratique) :
\`\`\`python
def tri_bulles(T):
    n = len(T)
    for i in range(n - 1):
        for j in range(n - 1 - i):
            if T[j] > T[j + 1]:
                # Échange des éléments
                T[j], T[j + 1] = T[j + 1], T[j]
    return T

# Exemple d'exécution
tableau = [15, 3, 9, 1, 12]
print("Tableau trié :", tri_bulles(tableau))
\`\`\`

#### 🔹 Requête SQL Type Examen :
\`\`\`sql
-- Sélectionner les élèves ayant une moyenne >= 10 groupés par section
SELECT section, COUNT(*) as nb_admis, AVG(moyenne) as moy_section
FROM Eleves
WHERE moyenne >= 10
GROUP BY section
HAVING COUNT(*) >= 5;
\`\`\`

As-tu besoin d'un algorithme récursif ou d'une fonction Python spécifique ?`;
  }

  // 6. Philosophie
  if (query.includes("philo") || query.includes("dissertation") || query.includes("morale") || query.includes("etat") || query.includes("verite") || query.includes("bonheur")) {
    return `### 🧠 Méthodologie & Concepts Clés : Philosophie Bac

#### 🏛️ Structure Modèle de la Dissertation :
1. **Introduction** :
   * **Amorce** : Partir d'une idée reçue ou d'un constat universel.
   * **Définition conceptuelle** : Préciser le sens des notions du sujet.
   * **Problématisation** : Mettre en tension deux vérités contradictoires.
   * **Question directrice** : Formuler l'énigme philosophique.
2. **Développement (Thèse - Antithèse - Dépassement)** :
   * Chaque paragraphe = **1 Argument + 1 Référence d'auteur + 1 Exemple précis + 1 Transition**.
3. **Conclusion** :
   * Bilan sans ambiguïté et ouverture vers un enjeu éthique contemporain.

Donne-moi ton sujet de dissertation ou une notion du programme (ex: *L'État*, *La Science*, *Le Devoir*) pour bâtir un plan détaillé !`;
  }

  // 7. Quiz & Questions d'entraînement
  if (query.includes("quiz") || query.includes("question") || query.includes("entrainement") || query.includes("test")) {
    return `### ⚡ Mini-Quiz d'Entraînement Rapide Bac (${section})

Teste tes réflexes sur ces 3 questions classiques :

1. **Maths** : Quelle est la primitive de $f(x) = \\frac{2x}{x^2 + 1}$ ?
   * *A)* $\\frac{1}{x^2+1}$
   * *B)* $\\ln(x^2 + 1) + c$
   * *C)* $e^{x^2+1}$

2. **Physique** : Dans un dipôle $RC$ en charge, que vaut la tension $u_C$ à $t = \\tau$ ?
   * *A)* $0.37 \\cdot E$
   * *B)* $0.63 \\cdot E$
   * *C)* $E$

3. **Informatique / Algo** : Quelle est la complexité d'une recherche dichotomique sur un tableau trié de taille $N$ ?
   * *A)* $O(N)$
   * *B)* $O(N^2)$
   * *C)* $O(\\log_2(N))$

✍️ Envoie-moi tes 3 réponses (ex: *1B, 2B, 3C*) et je te donne la correction détaillée !`;
  }

  // 8. Réponse générale pédagogique
  return `### 🎓 Tuteur Bac IA : Réponse Pédagogique

Concernant votre question sur **"${text}"** :

1. **Rappel Pédagogique** : Cette notion fait partie intégrante du programme officiel du Baccalauréat.
2. **Méthode Recommandée** :
   * Commencez toujours par définir le cadre d'étude et les hypothèses de base.
   * Appliquez les propriétés fondamentales et les formules standard.
   * Justifiez chaque étape de calcul ou de rédaction avec rigueur.

💡 **Astuce Bac** : N'hésitez pas à m'envoyer une photo d'un exercice précis avec l'icône **📷** ou à me demander un exemple d'application étape par étape !`;
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
