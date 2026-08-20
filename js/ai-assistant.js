// js/ai-assistant.js
// Assistant Vocal Multilingue Continu (Tounsi / Arabe / Français), Gemini Pro & Vision Scanner

import { database, ref, set } from "./firebase-config.js?v=16.5";
import { state, getStudentPath, showLoading, hideLoading } from "./state.js?v=16.5";
import { getSessionDateKey, render } from "./calendar.js?v=16.5";

let selectedAiSpeechLang = "ar-TN";
let aiSpeechRecognition = null;
let isAiSpeechRecording = false;
let accumulatedTranscript = "";

export const DEFAULT_AI_KEY = "";

export function getAiApiKey() {
  const saved = localStorage.getItem("gemini_api_key");
  if (saved && saved.trim()) return saved.trim();
  return "";
}

export function getAiModelName() {
  const saved = localStorage.getItem("gemini_model_name");
  if (saved && saved.trim() && !saved.includes("1.5") && !saved.includes("2.5-flash")) return saved.trim();
  return "gemini-3.6-flash"; // Modèle Google Gemini Vision officiel recommandé par Google
}

export function openAiSettingsModal() {
  const currentKey = localStorage.getItem("gemini_api_key") || DEFAULT_AI_KEY;
  const currentModel = getAiModelName();

  const keyInput = document.getElementById("aiApiKeyInput");
  if (keyInput) keyInput.value = currentKey;

  const modelSelect = document.getElementById("aiModelSelect");
  const customBox = document.getElementById("customModelBox");
  const customInput = document.getElementById("aiCustomModelInput");

  const standardModels = [
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.1-pro",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
  ];
  if (standardModels.includes(currentModel)) {
    if (modelSelect) modelSelect.value = currentModel;
    if (customBox) customBox.style.display = "none";
  } else {
    if (modelSelect) modelSelect.value = "custom";
    if (customBox) customBox.style.display = "flex";
    if (customInput) customInput.value = currentModel;
  }

  const fb = document.getElementById("aiTestFeedback");
  if (fb) fb.style.display = "none";

  window.openModal("aiSettingsModal");
}

export function onAiModelChange(val) {
  const customBox = document.getElementById("customModelBox");
  if (customBox) {
    customBox.style.display = val === "custom" ? "flex" : "none";
  }
}

export function handleSaveAiSettings(e) {
  e.preventDefault();
  const key = document.getElementById("aiApiKeyInput")?.value.trim() || "";
  const modelVal = document.getElementById("aiModelSelect")?.value;
  let finalModel = modelVal;

  if (modelVal === "custom") {
    const customName = document.getElementById("aiCustomModelInput")?.value.trim();
    finalModel = customName || "gemini-1.5-pro";
  }

  localStorage.setItem("gemini_api_key", key);
  localStorage.setItem("gemini_model_name", finalModel);

  window.closeModal("aiSettingsModal");
  alert(`✨ Configuration IA enregistrée avec succès !\nModèle actif : ${finalModel}`);
}

export async function testAiModelConnection() {
  const key = document.getElementById("aiApiKeyInput")?.value.trim();
  const fb = document.getElementById("aiTestFeedback");
  if (!fb) return;

  if (!key) {
    fb.style.display = "block";
    fb.style.background = "#fff1f2";
    fb.style.color = "#be123c";
    fb.innerHTML = "⚠️ Veuillez d'abord renseigner une clé API pour tester la connexion.";
    return;
  }

  const modelVal = document.getElementById("aiModelSelect")?.value;
  let modelToTest = modelVal;
  if (modelVal === "custom") {
    modelToTest = document.getElementById("aiCustomModelInput")?.value.trim() || "gemini-1.5-pro";
  }

  fb.style.display = "block";
  fb.style.background = "#f0f9ff";
  fb.style.color = "#0369a1";
  fb.innerHTML = `⏳ Test de connexion avec le modèle <b>${modelToTest}</b>...`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToTest}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Reponds seulement 'OK' si tu es operationnel." }] }],
      }),
    });

    if (res.ok) {
      fb.style.background = "#ecfdf5";
      fb.style.color = "#047857";
      fb.innerHTML = `✅ <b>Connexion réussie !</b> Le modèle <code>${modelToTest}</code> fonctionne parfaitement.`;
    } else {
      const errData = await res.json().catch(() => ({}));
      fb.style.background = "#fff1f2";
      fb.style.color = "#be123c";
      fb.innerHTML = `❌ <b>Erreur (${res.status})</b> : ${errData.error?.message || "Le modèle n'a pas répondu ou le nom n'est pas supporté."}`;
    }
  } catch (err) {
    fb.style.background = "#fff1f2";
    fb.style.color = "#be123c";
    fb.innerHTML = `❌ <b>Erreur réseau</b> : ${err.message}`;
  }
}

export function setAiDictationLang(lang) {
  selectedAiSpeechLang = lang;
  document.querySelectorAll(".lang-chip").forEach((btn) => btn.classList.remove("active"));
  const chip = document.getElementById(
    lang === "ar-TN"
      ? "langOpt_ar_tn"
      : lang === "fr-FR"
      ? "langOpt_fr_fr"
      : lang === "ar-SA"
      ? "langOpt_ar_sa"
      : "langOpt_en_us"
  );
  if (chip) chip.classList.add("active");

  if (isAiSpeechRecording && aiSpeechRecognition) {
    try {
      aiSpeechRecognition.stop();
    } catch (e) {}
    setTimeout(() => startAiSpeechRecording(), 300);
  }
}

export function voiceInput() {
  if (state.isReadOnly) return alert("Accès en lecture seule.");
  const feedback = document.getElementById("aiFeedbackBox");
  if (feedback) feedback.style.display = "none";
  window.openModal("aiAssistantModal");
  // Démarrage automatique de l'écoute continue à l'ouverture
  setTimeout(() => {
    startAiSpeechRecording();
  }, 250);
}

export function closeAiModal() {
  stopAiSpeechRecording();
  window.closeModal("aiAssistantModal");
}

export function useAiExample(txt) {
  const input = document.getElementById("aiTranscriptInput");
  if (input) input.value = txt;
}

function updateMicUiState(isRecording) {
  const micBtn = document.getElementById("aiModalMicBtn");
  const finishBtn = document.getElementById("btnAiFinishRecording");
  const startBtn = document.getElementById("btnAiStartRecording");

  if (micBtn) {
    if (isRecording) {
      micBtn.classList.add("listening");
      micBtn.innerHTML = "⏹️";
      micBtn.title = "Enregistrement en cours... Cliquez pour arrêter";
    } else {
      micBtn.classList.remove("listening");
      micBtn.innerHTML = "🎙️";
      micBtn.title = "Cliquez pour commencer à parler";
    }
  }

  if (finishBtn) finishBtn.style.display = isRecording ? "inline-flex" : "none";
  if (startBtn) startBtn.style.display = isRecording ? "none" : "inline-flex";
}

export function cleanDuplicateWords(text) {
  if (!text) return "";
  let s = text.trim();
  // 1. Supprime les répétitions de phrases ou groupes de mots consécutifs (ex: "ajoute demain ajoute demain" -> "ajoute demain")
  for (let pass = 0; pass < 3; pass++) {
    s = s.replace(/([\p{L}\p{N}]+(?:\s+[\p{L}\p{N}]+){1,8})(?:\s+\1)+(?=\s|$|[.,!?])/giu, "$1");
    // 2. Supprime les répétitions consécutives de mots uniques (ex: "ajoute ajoute" -> "ajoute", "exercices exercices" -> "exercices", "غدا غدا" -> "غدا")
    s = s.replace(/([\p{L}\p{N}]+)(?:\s+\1)+(?=\s|$|[.,!?])/giu, "$1");
  }
  return s.replace(/\s{2,}/g, " ").trim();
}

export function mergeTranscripts(base, addition) {
  base = (base || "").trim();
  addition = (addition || "").trim();
  if (!base) return addition;
  if (!addition) return base;

  // Si l'addition est déjà contenue à la fin de base
  if (base.toLowerCase().endsWith(addition.toLowerCase())) {
    return base;
  }
  // Si base est le préfixe de addition
  if (addition.toLowerCase().startsWith(base.toLowerCase())) {
    return addition;
  }

  const baseWords = base.split(/\s+/);
  const addWords = addition.split(/\s+/);

  let maxOverlap = 0;
  const maxCheck = Math.min(baseWords.length, addWords.length, 25);
  for (let len = 1; len <= maxCheck; len++) {
    const baseSlice = baseWords.slice(baseWords.length - len).join(" ").toLowerCase();
    const addSlice = addWords.slice(0, len).join(" ").toLowerCase();
    if (baseSlice === addSlice) {
      maxOverlap = len;
    }
  }

  if (maxOverlap > 0) {
    const nonOverlappingAdd = addWords.slice(maxOverlap).join(" ");
    return nonOverlappingAdd ? `${base} ${nonOverlappingAdd}` : base;
  }

  return `${base} ${addition}`;
}

export class VoiceTranscriber {
  constructor(options = {}) {
    this.lang = options.lang || "ar-TN";
    this.onUpdate = options.onUpdate || (() => {});
    this.onStateChange = options.onStateChange || (() => {});
    this.isRecording = false;
    this.recognition = null;
    this.restartTimer = null;
    this.previousSessionText = "";
    this.currentSessionText = "";
  }

  start(initialText = "") {
    this.stop();
    this.isRecording = true;
    this.previousSessionText = cleanDuplicateWords((initialText || "").trim());
    this.currentSessionText = "";
    this._startInstance();
    this.onStateChange(true);
    this._publish();
  }

  stop() {
    this.isRecording = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onresult = null;
        this.recognition.onerror = null;
        this.recognition.onend = null;
        this.recognition.stop();
      } catch (e) {}
      this.recognition = null;
    }
    if (this.currentSessionText) {
      this.previousSessionText = mergeTranscripts(this.previousSessionText, this.currentSessionText);
      this.currentSessionText = "";
    }
    this.previousSessionText = cleanDuplicateWords(this.previousSessionText);
    this.onStateChange(false);
    this._publish();
  }

  _startInstance() {
    if (!this.isRecording) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      const rec = new SpeechRecognition();
      rec.lang = this.lang;
      rec.continuous = true;
      rec.interimResults = true;

      rec.onstart = () => {
        if (this.isRecording) {
          this.onStateChange(true);
        }
      };

      rec.onresult = (event) => {
        if (!this.isRecording) return;

        let finalStr = "";
        let lastFinalIndex = -1;

        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalStr += (finalStr ? " " : "") + event.results[i][0].transcript.trim();
            lastFinalIndex = i;
          }
        }

        let interimStr = "";
        for (let i = lastFinalIndex + 1; i < event.results.length; i++) {
          interimStr += (interimStr ? " " : "") + event.results[i][0].transcript.trim();
        }

        if (finalStr && interimStr) {
          this.currentSessionText = `${finalStr} ${interimStr}`.trim();
        } else {
          this.currentSessionText = (finalStr || interimStr).trim();
        }

        this._publish();
      };

      rec.onerror = (event) => {
        console.warn("Speech recognition notice:", event.error);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          this.stop();
        }
      };

      rec.onend = () => {
        if (!this.isRecording) return;

        if (this.currentSessionText) {
          this.previousSessionText = mergeTranscripts(this.previousSessionText, this.currentSessionText);
          this.currentSessionText = "";
          this._publish();
        }

        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
          if (this.isRecording) {
            this._startInstance();
          }
        }, 150);
      };

      this.recognition = rec;
      rec.start();
    } catch (err) {
      console.warn("Speech recognition start retry:", err);
      if (this.restartTimer) clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => {
        if (this.isRecording) this._startInstance();
      }, 300);
    }
  }

  _publish() {
    const full = this.currentSessionText
      ? mergeTranscripts(this.previousSessionText, this.currentSessionText)
      : this.previousSessionText;
    const cleaned = cleanDuplicateWords(full);
    this.onUpdate(cleaned);
  }
}

let aiVoiceTranscriber = null;

export function toggleAiSpeechRecording() {
  if (isAiSpeechRecording) {
    stopAiSpeechRecording();
  } else {
    startAiSpeechRecording();
  }
}

export function stopAiSpeechRecording() {
  if (aiVoiceTranscriber) {
    aiVoiceTranscriber.stop();
  }
  isAiSpeechRecording = false;
  updateMicUiState(false);
  const st = document.getElementById("aiMicStatusText");
  if (st) {
    st.innerHTML = "✅ <b>Dictée terminée !</b> Cliquez sur <b>'✨ Analyser & Ajouter'</b> pour insérer la séance et le travail à faire.";
    st.style.color = "#059669";
  }
}

export function startAiSpeechRecording() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("La reconnaissance vocale n'est pas supportée par votre navigateur actuel. Vous pouvez saisir votre commande au clavier.");
    return;
  }

  const transcriptInput = document.getElementById("aiTranscriptInput");
  const initialText = transcriptInput ? transcriptInput.value.trim() : "";

  if (!aiVoiceTranscriber) {
    aiVoiceTranscriber = new VoiceTranscriber({
      lang: selectedAiSpeechLang,
      onUpdate: (fullText) => {
        const inp = document.getElementById("aiTranscriptInput");
        if (inp) {
          inp.value = fullText;
        }
      },
      onStateChange: (recording) => {
        isAiSpeechRecording = recording;
        updateMicUiState(recording);
        const statusText = document.getElementById("aiMicStatusText");
        if (statusText && recording) {
          const langNames = {
            "ar-TN": "🇹🇳 Tounsi (Derja)",
            "fr-FR": "🇫🇷 Français",
            "ar-SA": "🇸🇦 Arabe",
            "en-US": "🇬🇧 Anglais",
          };
          statusText.innerHTML = `🔴 <b>Écoute active (${langNames[selectedAiSpeechLang] || "Tounsi"})...</b><br><span style="font-size:11.5px; opacity:0.9;">Parlez à votre rythme. Cliquez sur <b>⏹️ Terminer</b> quand vous avez fini.</span>`;
          statusText.style.color = "#0284c7";
        }
      }
    });
  }

  aiVoiceTranscriber.lang = selectedAiSpeechLang;
  aiVoiceTranscriber.start(initialText);
}

export async function executeAiCommand() {
  if (state.isReadOnly) return alert("Accès en lecture seule.");
  stopAiSpeechRecording();

  const input = document.getElementById("aiTranscriptInput");
  const rawText = input ? input.value.trim() : "";
  const text = cleanDuplicateWords(rawText);
  if (input) input.value = text;
  const feedback = document.getElementById("aiFeedbackBox");

  if (!text) {
    alert("Veuillez d'abord dicter ou saisir une instruction.");
    return;
  }

  showLoading("Analyse intelligente par l'Assistant IA...");
  const geminiKey = getAiApiKey();
  let parsedResult = null;

  if (geminiKey) {
    try {
      parsedResult = await callGeminiTunisianParser(text, geminiKey);
    } catch (e) {
      console.warn("Gemini API call failed, fallback to native multilingual parser:", e);
    }
  }

  if (!parsedResult) {
    parsedResult = parseTunisianNaturalLanguageLocally(text);
  }

  hideLoading();

  if (!parsedResult || !parsedResult.subject) {
    if (feedback) {
      feedback.style.display = "block";
      feedback.style.background = "#fff1f2";
      feedback.style.color = "#be123c";
      feedback.style.border = "1.5px solid #fecdd3";
      feedback.innerHTML = `⚠️ <b>Non compris</b> : L'IA n'a pas pu identifier la matière ou l'horaire.<br>Essayez par exemple : <i>"Zidli seance Math ghodwa 14h particulier w khedma serie 3"</i> ou <i>"Séance SVT samedi 9h au lycée travail à faire TP génétique"</i>.`;
    }
    return;
  }

  const dayNamesFr = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const sH = typeof parsedResult.startHour === "number" ? parsedResult.startHour : 14;
  const sM = typeof parsedResult.startMinute === "number" ? parsedResult.startMinute : 0;
  const eH = typeof parsedResult.endHour === "number" ? parsedResult.endHour : Math.min(24, sH + 2);
  const eM = typeof parsedResult.endMinute === "number" ? parsedResult.endMinute : sM;
  const dayIdx = parsedResult.dayIndex !== undefined && parsedResult.dayIndex !== null ? Math.max(0, Math.min(6, parsedResult.dayIndex)) : (new Date().getDay() + 6) % 7;

  const targetDateKey = parsedResult.dateStr || getSessionDateKey(dayIdx);
  const newId = Date.now().toString();

  if (parsedResult.action === "add_exam") {
    const examObj = {
      id: newId,
      sub: parsedResult.subject,
      type: parsedResult.examType || "Devoir de Contrôle (DC)",
      date: parsedResult.dateStr || targetDateKey,
      desc: parsedResult.todo || parsedResult.desc || "Planifié automatiquement par Assistant IA",
    };
    await set(ref(database, getStudentPath("examens/" + newId)), examObj);
  } else {
    const sessionObj = {
      id: newId,
      sub: parsedResult.subject,
      day: dayIdx,
      s: sH * 60 + sM,
      e: eH * 60 + eM,
      type: parsedResult.type || "À la maison",
      freq: parsedResult.freq || (parsedResult.dateStr ? "Ce jour seulement" : "Chaque semaine"),
      singleDate: parsedResult.singleDate || (parsedResult.freq === "Ce jour seulement" ? targetDateKey : null),
      location: parsedResult.location || null,
    };
    await set(ref(database, getStudentPath("seances/" + newId)), sessionObj);

    // Enregistrement du travail à faire / devoirs s'il est spécifié
    if (parsedResult.todo && parsedResult.todo.trim()) {
      const cleanedTodo = cleanDuplicateWords(parsedResult.todo.trim());
      const todoKey = `${newId}_${targetDateKey}`;
      const todoObj = {
        todo: cleanedTodo,
        todoDone: false,
        date: targetDateKey,
        sessionId: newId,
      };
      await set(ref(database, getStudentPath(`seances_todos/${todoKey}`)), todoObj);
      if (!state.sessionDateTodos) state.sessionDateTodos = {};
      state.sessionDateTodos[todoKey] = todoObj;
    }
  }

  if (render) render();

  if (feedback) {
    feedback.style.display = "block";
    feedback.style.background = "#ecfdf5";
    feedback.style.color = "#047857";
    feedback.style.border = "1.5px solid #a7f3d0";
    const timeFmt = `${sH < 10 ? "0" + sH : sH}:${sM < 10 ? "0" + sM : sM} - ${eH < 10 ? "0" + eH : eH}:${eM < 10 ? "0" + eM : eM}`;
    const locNotice = parsedResult.location?.address ? `<br>📍 <b>Lieu :</b> ${parsedResult.location.address}` : "";
    const todoNotice = parsedResult.todo
      ? `<div style="background:#fff7ed; border:1px solid #fdba74; padding:8px 12px; border-radius:8px; color:#c2410c; margin-top:6px; font-size:12.5px;">📝 <b>Travail à faire :</b> ${parsedResult.todo} <span style="font-size:11px; font-weight:800; color:#ea580c; display:block; margin-top:2px;">(Badge orange '⏳ Ex. À faire' actif sur la séance)</span></div>`
      : "";

    feedback.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:4px;">
        <div style="font-size:14px; font-weight:800; color:#065f46;">🎉 Séance ajoutée avec succès au planning !</div>
        <div>📚 <b>Matière :</b> ${parsedResult.subject}</div>
        <div>🗓️ <b>Jour & Heure :</b> ${dayNamesFr[dayIdx]} (${targetDateKey}) • 🕒 ${timeFmt}</div>
        <div>🏷️ <b>Type / Modalité :</b> ${parsedResult.type || "À la maison"}${locNotice}</div>
        ${todoNotice}
        ${parsedResult.replyMessage ? `<div style="font-style:italic; opacity:0.9; margin-top:4px; font-size:12px; border-top:1px dashed #a7f3d0; padding-top:4px;">💬 ${parsedResult.replyMessage}</div>` : ""}
      </div>
    `;
  }
}

export async function callGeminiTunisianParser(userText, apiKey) {
  const modelName = getAiModelName();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const now = new Date();
  const currentDayName = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"][now.getDay()];
  const todayIso = now.toISOString().split("T")[0];

  const systemPrompt = `Tu es un assistant IA spécialisé pour les élèves du Baccalauréat tunisien (toutes sections : Math, Sciences, Informatique, Éco-Gestion, Technique, Lettres, Sport).
Tu comprends parfaitement le dialecte tunisien (Derja en lettres arabes ou arabizi : 3=ع, 7=ح, 9=ق, 5=خ, 2=ء), l'arabe classique et le français.
Aujourd'hui nous sommes ${currentDayName} ${todayIso}.

Extrais TOUTES les informations de la demande de l'élève (Matière, Horaires début/fin, Jour/Date, Type de cours/Lieu, et le Travail à faire / Devoirs / Exercices).
Réponds STRICTEMENT avec un JSON valide sans formatage markdown, respectant ce schéma exact :
{
  "action": "add_session" ou "add_exam",
  "subject": "Mathématiques" | "Sciences Physiques" | "Sciences SVT" | "Informatique" | "Philosophie" | "Arabe" | "Français" | "Anglais" | "Économie & Gestion" | "Histoire-Géo" | "Sport" | "Option",
  "dayIndex": nombre de 0 (Lundi) à 6 (Dimanche),
  "dateStr": "YYYY-MM-DD" (date exacte de la séance),
  "startHour": nombre de 8 à 23 (ex: 14 pour 14h),
  "startMinute": nombre de 0 à 59 (ex: 0 ou 30),
  "endHour": nombre de 8 à 24 (si non précisé, calcule début + 2h),
  "endMinute": nombre de 0 à 59,
  "type": "À la maison" | "Lycée" | "Particulier" | "En ligne",
  "location": { "address": "Nom du lieu ou ville", "lat": 36.8065, "lng": 10.1815 },
  "todo": "Texte complet du travail à faire, devoirs, exercices ou chapitres demandés (ex: Série 3 analyse exercices 1 et 4), ou null si aucun travail mentionné",
  "freq": "Chaque semaine" ou "Ce jour seulement",
  "examType": "Devoir de Contrôle (DC)" ou "Devoir de Synthèse (DS)" ou "Examen Blanc",
  "replyMessage": "Message de confirmation amical et motivant bilingue tunisien/français récapitulant la séance, l'horaire, le type et les exercices enregistrés"
}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\nCommande élève : "${userText}"` }] }],
      generationConfig: {
        temperature: 0.1,
      },
    }),
  });

  if (!res.ok) throw new Error("Gemini API HTTP Error " + res.status);
  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleanJson);
}

export function parseTunisianNaturalLanguageLocally(rawText) {
  const text = rawText.toLowerCase();

  let subject = null;
  if (/math|mathematique|رياضيات|مات|alg|geometrie|analyse/i.test(text)) subject = "Mathématiques";
  else if (/phys|physique|chimie|فيزياء|فيزيك|chim/i.test(text)) subject = "Sciences Physiques";
  else if (/svt|science|3ouloum|علوم|nature|bio|genetique/i.test(text)) subject = "Sciences SVT";
  else if (/info|informatique|tic|algo|python|sql|انفورماتيك|اعلامية/i.test(text)) subject = "Informatique";
  else if (/philo|philosophie|falsafa|فلسفة/i.test(text)) subject = "Philosophie";
  else if (/arabe|3arbi|3arabia|عربية|نصوص|ادب/i.test(text)) subject = "Arabe";
  else if (/franc|french|فرنسية/i.test(text)) subject = "Français";
  else if (/angl|english|انقليزية/i.test(text)) subject = "Anglais";
  else if (/eco|gestion|compta|اقتصاد|تصرف/i.test(text)) subject = "Économie & Gestion";
  else if (/histoire|geo|hg|تاريخ|جغرافيا/i.test(text)) subject = "Histoire-Géo";
  else if (/espagnol|italien|allemand|option|اسبانية/i.test(text)) subject = "Option";
  else if (/sport|eps|رياضة/i.test(text)) subject = "Sport";

  if (!subject) return null;

  const now = new Date();
  let todayIdx = (now.getDay() + 6) % 7;
  let dayIndex = todayIdx;
  let dayOffset = 0;

  if (/ghodwa|demain|غدا|غدوة/i.test(text)) {
    dayIndex = (todayIdx + 1) % 7;
    dayOffset = 1;
  } else if (/ba3d ghodwa|apres demain|après-demain|بعد غد/i.test(text)) {
    dayIndex = (todayIdx + 2) % 7;
    dayOffset = 2;
  } else if (/lundi|ethnin|ithnin|الاثنين/i.test(text)) {
    dayIndex = 0;
    dayOffset = (7 + 0 - todayIdx) % 7;
  } else if (/mardi|thletha|tleta|الثلاثاء/i.test(text)) {
    dayIndex = 1;
    dayOffset = (7 + 1 - todayIdx) % 7;
  } else if (/mercredi|arba3a|lerba3|الأربعاء|الاربعاء/i.test(text)) {
    dayIndex = 2;
    dayOffset = (7 + 2 - todayIdx) % 7;
  } else if (/jeudi|khmis|elkhmis|الخميس/i.test(text)) {
    dayIndex = 3;
    dayOffset = (7 + 3 - todayIdx) % 7;
  } else if (/vendredi|jem3a|jom3a|الجمعة/i.test(text)) {
    dayIndex = 4;
    dayOffset = (7 + 4 - todayIdx) % 7;
  } else if (/samedi|sebt|essebt|السبت/i.test(text)) {
    dayIndex = 5;
    dayOffset = (7 + 5 - todayIdx) % 7;
  } else if (/dimanche|a7ad|elahad|الأحد|الاحد/i.test(text)) {
    dayIndex = 6;
    dayOffset = (7 + 6 - todayIdx) % 7;
  }

  const targetDateObj = new Date(now.getTime() + dayOffset * 86400000);
  const targetDateStr = `${targetDateObj.getFullYear()}-${String(targetDateObj.getMonth() + 1).padStart(2, "0")}-${String(targetDateObj.getDate()).padStart(2, "0")}`;

  let startHour = 14;
  let startMinute = 0;
  let endHour = 16;
  let endMinute = 0;

  // Détection des horaires "de Xh à Yh" ou "m3a Xh"
  const matchRange = text.match(/(?:de|men|من)\s*(\d{1,2})(?:h|:|\s*heures?)(\d{2})?\s*(?:a|à|hatta|ila|حتى|إلى)\s*(\d{1,2})(?:h|:|\s*heures?)(\d{2})?/i);
  if (matchRange) {
    startHour = parseInt(matchRange[1]);
    if (matchRange[2]) startMinute = parseInt(matchRange[2]);
    endHour = parseInt(matchRange[3]);
    if (matchRange[4]) endMinute = parseInt(matchRange[4]);
    if (startHour < 7) startHour += 12;
    if (endHour < startHour && endHour < 12) endHour += 12;
  } else {
    const matchTime = text.match(/(?:m3a|a|à|fi|ساعة|مع)?\s*(\d{1,2})(?:h|:|\s*heures?)(\d{2})?/i);
    if (matchTime) {
      startHour = parseInt(matchTime[1]);
      if (matchTime[2]) startMinute = parseInt(matchTime[2]);
      if (startHour < 8 && !/sbe7|matin/i.test(text)) startHour += 12;
      endHour = Math.min(24, startHour + 2);
    } else {
      if (/se3tin|zousta3ech/i.test(text)) startHour = 14;
      else if (/tlatha|tletata3ech/i.test(text)) startHour = 15;
      else if (/arba3ata3ech/i.test(text)) startHour = 16;
      else if (/3achiya|après-midi/i.test(text)) startHour = 15;
      else if (/lil|soir/i.test(text)) startHour = 20;
      else if (/sbe7|matin/i.test(text)) startHour = 9;
      endHour = Math.min(24, startHour + 2);
    }
  }

  const isExam = /devoir|examen|ds|dc|test|امتحان|فرض/i.test(text);

  const isPart = /particulier|etude|étude|dar el prof|chez prof|fi darou|برتيكولي|دروس خصوصية/i.test(text);
  let sessionType = "À la maison";
  let sessionLoc = null;

  if (isPart) {
    sessionType = "Particulier";
    let addr = "Cours Particulier";
    let lat = 36.8065,
      lng = 10.1815;
    if (/nasser|ennasr/i.test(text)) {
      addr = "Ennasr, Ariana";
      lat = 36.845;
      lng = 10.165;
    } else if (/ariana/i.test(text)) {
      addr = "Ariana Centre";
      lat = 36.8665;
      lng = 10.1956;
    } else if (/menzah/i.test(text)) {
      addr = "El Menzah, Tunis";
      lat = 36.838;
      lng = 10.175;
    } else if (/sousse/i.test(text)) {
      addr = "Sousse Ville";
      lat = 35.8256;
      lng = 10.6369;
    } else if (/sfax/i.test(text)) {
      addr = "Sfax Centre";
      lat = 34.7406;
      lng = 10.7603;
    } else if (/bizerte/i.test(text)) {
      addr = "Bizerte";
      lat = 37.2744;
      lng = 9.8739;
    } else if (/dar el prof|chez prof/i.test(text)) {
      addr = "Chez le Professeur";
    }
    sessionLoc = { address: addr, lat, lng };
  } else if (/lycee|lycée|ecole|معهد/i.test(text)) {
    sessionType = "Lycée";
  } else if (/ligne|zoom|meet|teams|اونلاين/i.test(text)) {
    sessionType = "En ligne";
  } else if (/dar|maison|دار/i.test(text)) {
    sessionType = "À la maison";
  }

  // Extraction du travail à faire / devoirs / exercices
  let extractedTodo = null;
  const todoMatch = rawText.match(/(?:travail(?:\s+à|\s+a)?\s+faire|exercices?|exos?|s[eé]rie|khedma|w\s+el\s+khedma|wal\s+khedma|w\s+khedma|الخدمة|والخدمة|تمارين|واجب|r[eé]vision|projet|chapitre|tp|td)\s*[:=\s\-]+([^.]+)/i);
  if (todoMatch && todoMatch[1]) {
    extractedTodo = todoMatch[1].trim();
  }

  return {
    action: isExam ? "add_exam" : "add_session",
    subject: subject,
    dayIndex: dayIndex,
    dateStr: targetDateStr,
    startHour: startHour,
    startMinute: startMinute,
    endHour: endHour,
    endMinute: endMinute,
    type: sessionType,
    location: sessionLoc,
    todo: extractedTodo,
    freq: dayOffset > 0 ? "Ce jour seulement" : "Chaque semaine",
    replyMessage: isPart
      ? "فهمتك بالباهي ! تم تسجيل حصة الدرس الخصوصي مع تحديد الموقع على الخريطة والواجبات المطلوبة بنجاح."
      : "فهمتك بالباهي ! تم تسجيل الحصة والعمل المطلوب في جدول أوقاتك بنجاح.",
  };
}

export async function handleImageUpload(e) {
  if (state.isReadOnly) return alert("Accès en lecture seule.");
  const file = e.target.files?.[0];
  if (!file) return;

  const apiKey = getAiApiKey();
  if (!apiKey) {
    if (e.target) e.target.value = "";
    const proceed = confirm(
      "🔑 Clé API Google Gemini requise pour la Vision IA :\n\n" +
      "Pour analyser vos photos d'emploi du temps avec l'IA, veuillez configurer votre clé API Google Gemini (100% gratuite sur https://aistudio.google.com/app/apikey).\n\n" +
      "👉 Cliquez sur OK pour ouvrir les paramètres et coller votre clé."
    );
    if (proceed) {
      window.promptSetAiApiKey ? window.promptSetAiApiKey() : window.openAiSettingsModal();
    }
    return;
  }

  showLoading("🧠 Analyse de l'emploi du temps par Vision IA...");

  try {
    const reader = new FileReader();
    reader.onerror = function () {
      hideLoading();
      alert("Erreur de lecture du fichier image.");
      if (e.target) e.target.value = "";
    };

    reader.onload = async function () {
      try {
        const base64Data = reader.result.split(",")[1];
        const primaryModel = getAiModelName();
        const fallbackModels = [
          primaryModel,
          "gemini-3.6-flash",
          "gemini-3.7-flash",
          "gemini-3.1-pro",
          "gemini-2.5-pro",
          "gemini-2.0-flash",
        ].filter((m, i, arr) => arr.indexOf(m) === i);

        let responseData = null;
        let lastError = null;

        const promptText = `Tu es un assistant expert pour les élèves de lycée en Tunisie.
Analyse cet emploi du temps (ou photo de séances de cours/lycée) et extrait TOUTES les séances de cours trouvées.
Réponds STRICTEMENT avec un tableau JSON valide au format suivant, sans aucun texte autour :
[
  {
    "sub": "Mathématiques",
    "day": 0,
    "s": 480,
    "e": 600,
    "type": "Lycée"
  }
]
Règles :
- "sub" : Le nom officiel de la matière (ex: Mathématiques, Sciences Physiques, Sciences SVT, Informatique, Philosophie, Arabe, Français, Anglais, Sport, Option, Histoire-Géo).
- "day" : Indice du jour de la semaine (0 pour Lundi, 1 pour Mardi, 2 pour Mercredi, 3 pour Jeudi, 4 pour Vendredi, 5 pour Samedi, 6 pour Dimanche).
- "s" : Heure de début en minutes depuis minuit (ex: 8h00 = 480, 8h30 = 510, 9h00 = 540, 10h00 = 600, 14h00 = 840, 15h00 = 900, 16h00 = 960).
- "e" : Heure de fin en minutes depuis minuit (ex: 10h00 = 600, 11h00 = 660, 12h00 = 720, 16h00 = 960, 18h00 = 1080).
- "type" : "Lycée", "À la maison" ou "Cours Particulier".`;

        for (const model of fallbackModels) {
          try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      { text: promptText },
                      {
                        inlineData: {
                          mimeType: file.type || "image/jpeg",
                          data: base64Data,
                        },
                      },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0.1,
                },
              }),
            });

            if (res.ok) {
              responseData = await res.json();
              break;
            } else {
              const errBody = await res.json().catch(() => ({}));
              lastError = errBody.error?.message || `HTTP ${res.status}`;
            }
          } catch (fetchErr) {
            lastError = fetchErr.message;
          }
        }

        if (!responseData) {
          throw new Error(lastError || "Impossible de contacter les serveurs Google Vision IA.");
        }

        const rawText = responseData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        let cleanJson = jsonMatch ? jsonMatch[0] : rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        const sessions = JSON.parse(cleanJson);

        if (Array.isArray(sessions) && sessions.length > 0) {
          for (const s of sessions) {
            const newId = Date.now().toString() + Math.floor(Math.random() * 10000);
            await set(ref(database, getStudentPath("seances/" + newId)), {
              id: newId,
              sub: s.sub || "Mathématiques",
              day: typeof s.day === "number" ? Math.max(0, Math.min(6, s.day)) : 0,
              s: typeof s.s === "number" ? s.s : 480,
              e: typeof s.e === "number" ? s.e : 600,
              type: s.type || "Lycée",
              freq: "Chaque semaine",
            });
          }
          hideLoading();
          alert(`🎉 ${sessions.length} séances ont été extraites et ajoutées à votre planning avec succès !`);
        } else {
          hideLoading();
          alert("⚠️ Aucune séance n'a été détectée sur cette photo. Assurez-vous que l'image est bien nette et éclairée.");
        }
      } catch (innerErr) {
        hideLoading();
        console.error("Erreur Vision IA:", innerErr);
        if (innerErr.message.includes("blocked") || innerErr.message.includes("403") || innerErr.message.includes("PERMISSION_DENIED")) {
          const proceed = confirm(
            "⚠️ Clé API Google Gemini requise pour la Vision IA :\n\n" +
            "La clé par défaut du projet ne dispose pas des droits d'accès à l'API Vision (Erreur 403: API_KEY_SERVICE_BLOCKED).\n\n" +
            "👉 Voulez-vous coller votre propre clé API gratuite Google (obtenue en 30 secondes sur https://aistudio.google.com) pour scanner vos emplois du temps ?"
          );
          if (proceed) {
            window.promptSetAiApiKey ? window.promptSetAiApiKey() : window.openAiSettingsModal();
          }
        } else {
          alert("⚠️ Erreur lors de l'analyse par l'IA :\n" + innerErr.message + "\n\n💡 Vérifiez votre clé API Google Gemini dans les paramètres ou réessayez avec une photo plus nette.");
        }
      } finally {
        hideLoading();
        if (e.target) e.target.value = "";
      }
    };

    reader.readAsDataURL(file);
  } catch (err) {
    hideLoading();
    if (e.target) e.target.value = "";
    alert("Erreur : " + err.message);
  }
}

// Global Window Bindings
window.setApiKey = openAiSettingsModal;
window.getAiModelName = getAiModelName;
window.openAiSettingsModal = openAiSettingsModal;
window.onAiModelChange = onAiModelChange;
window.handleSaveAiSettings = handleSaveAiSettings;
window.testAiModelConnection = testAiModelConnection;
window.setAiDictationLang = setAiDictationLang;
window.voiceInput = voiceInput;
window.closeAiModal = closeAiModal;
window.useAiExample = useAiExample;
window.toggleAiSpeechRecording = toggleAiSpeechRecording;
window.startAiSpeechRecording = startAiSpeechRecording;
window.stopAiSpeechRecording = stopAiSpeechRecording;
window.executeAiCommand = executeAiCommand;
window.handleImageUpload = handleImageUpload;

