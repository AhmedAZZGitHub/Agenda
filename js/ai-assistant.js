// js/ai-assistant.js
// Assistant Vocal Multilingue (Tounsi / Arabe / Français), Gemini Pro 3.1 & Vision Scanner

import { database, ref, set } from "./firebase-config.js?v=15.0";
import { state, getStudentPath, showLoading, hideLoading, playBeep } from "./state.js?v=15.0";

let selectedAiSpeechLang = "ar-TN";
let aiSpeechRecognition = null;
let isAiSpeechRecording = false;

export const DEFAULT_AI_KEY = "AIzaSyBsC9bjxuhysJ6AyouCS1kcyHNg0Dpic1c";

export function getAiApiKey() {
  const saved = localStorage.getItem("gemini_api_key");
  if (saved && saved.trim()) return saved.trim();
  return DEFAULT_AI_KEY; // Clé intégrée par défaut dans l'application
}

export function getAiModelName() {
  const saved = localStorage.getItem("gemini_model_name");
  if (saved && saved.trim()) return saved.trim();
  return "gemini-3.1-pro"; // Modèle Google Gemini 3.1 Pro par défaut
}

export function openAiSettingsModal() {
  const currentKey = localStorage.getItem("gemini_api_key") || DEFAULT_AI_KEY;
  const currentModel = getAiModelName();

  const keyInput = document.getElementById("aiApiKeyInput");
  if (keyInput) keyInput.value = currentKey;

  const modelSelect = document.getElementById("aiModelSelect");
  const customBox = document.getElementById("customModelBox");
  const customInput = document.getElementById("aiCustomModelInput");

  const standardModels = ["gemini-1.5-pro", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-3.1-pro"];
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
    aiSpeechRecognition.stop();
    setTimeout(() => startAiSpeechRecording(), 300);
  }
}

export function voiceInput() {
  if (state.isReadOnly) return alert("Accès en lecture seule.");
  const feedback = document.getElementById("aiFeedbackBox");
  if (feedback) feedback.style.display = "none";
  window.openModal("aiAssistantModal");
}

export function closeAiModal() {
  if (isAiSpeechRecording && aiSpeechRecognition) {
    try {
      aiSpeechRecognition.stop();
    } catch (e) {}
  }
  isAiSpeechRecording = false;
  const micBtn = document.getElementById("aiModalMicBtn");
  if (micBtn) micBtn.classList.remove("listening");
  window.closeModal("aiAssistantModal");
}

export function useAiExample(txt) {
  const input = document.getElementById("aiTranscriptInput");
  if (input) input.value = txt;
}

export function toggleAiSpeechRecording() {
  if (isAiSpeechRecording) {
    if (aiSpeechRecognition) {
      try {
        aiSpeechRecognition.stop();
      } catch (e) {}
    }
    isAiSpeechRecording = false;
    const micBtn = document.getElementById("aiModalMicBtn");
    if (micBtn) micBtn.classList.remove("listening");
    const st = document.getElementById("aiMicStatusText");
    if (st) st.innerText = "Enregistrement arrêté. Cliquez sur 'Analyser & Ajouter'.";
  } else {
    startAiSpeechRecording();
  }
}

export function startAiSpeechRecording() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("La reconnaissance vocale n'est pas supportée par votre navigateur actuel. Vous pouvez saisir votre commande au clavier.");
    return;
  }

  try {
    aiSpeechRecognition = new SpeechRecognition();
    aiSpeechRecognition.lang = selectedAiSpeechLang;
    aiSpeechRecognition.interimResults = true;
    aiSpeechRecognition.continuous = false;

    const micBtn = document.getElementById("aiModalMicBtn");
    const statusText = document.getElementById("aiMicStatusText");
    const transcriptInput = document.getElementById("aiTranscriptInput");

    aiSpeechRecognition.onstart = function () {
      isAiSpeechRecording = true;
      if (micBtn) micBtn.classList.add("listening");
      const langNames = { "ar-TN": "🇹🇳 Tounsi (Derja)", "fr-FR": "🇫🇷 Français", "ar-SA": "🇸🇦 Arabe", "en-US": "🇬🇧 Anglais" };
      if (statusText) {
        statusText.innerText = `🎙️ En écoute en ${langNames[selectedAiSpeechLang] || "Tounsi"}... Parlez maintenant !`;
        statusText.style.color = "#0284c7";
      }
    };

    aiSpeechRecognition.onresult = function (event) {
      let currentTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript;
      }
      if (transcriptInput) transcriptInput.value = currentTranscript;
    };

    aiSpeechRecognition.onerror = function (event) {
      console.warn("Speech recognition error:", event.error);
      isAiSpeechRecording = false;
      if (micBtn) micBtn.classList.remove("listening");
      if (statusText) {
        statusText.innerText = "⚠️ Erreur ou micro silencieux. Réessayez ou tapez au clavier.";
        statusText.style.color = "#ef4444";
      }
    };

    aiSpeechRecognition.onend = function () {
      isAiSpeechRecording = false;
      if (micBtn) micBtn.classList.remove("listening");
      if (statusText) {
        statusText.innerText = "✅ Dictée captée ! Cliquez sur '⚡ Analyser & Ajouter'.";
        statusText.style.color = "#059669";
      }
    };

    aiSpeechRecognition.start();
  } catch (err) {
    console.error("SpeechRecognition start exception:", err);
  }
}

export async function executeAiCommand() {
  if (state.isReadOnly) return alert("Accès en lecture seule.");
  const input = document.getElementById("aiTranscriptInput");
  const text = input ? input.value.trim() : "";
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
      feedback.innerHTML = `⚠️ <b>Non compris</b> : L'IA n'a pas pu identifier la matière ou l'horaire.<br>Essayez par exemple : <i>"Zidli seance Math ghodwa m3a 14h"</i> ou <i>"Devoir physique vendredi 10h"</i>.`;
    }
    return;
  }

  const dayNamesFr = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const sH = parsedResult.startHour ?? 14;
  const sM = parsedResult.startMinute ?? 0;
  const eH = parsedResult.endHour ?? sH + 2;
  const eM = parsedResult.endMinute ?? sM;
  const dayIdx = parsedResult.dayIndex !== undefined && parsedResult.dayIndex !== null ? parsedResult.dayIndex : (new Date().getDay() + 6) % 7;

  const newId = Date.now().toString();

  if (parsedResult.action === "add_exam") {
    const examObj = {
      id: newId,
      sub: parsedResult.subject,
      type: parsedResult.examType || "Devoir de Contrôle (DC)",
      date: parsedResult.dateStr || new Date().toISOString().split("T")[0],
      desc: "Planifié automatiquement par Assistant IA",
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
      freq: "Chaque semaine",
      location: parsedResult.location || null,
    };
    await set(ref(database, getStudentPath("seances/" + newId)), sessionObj);
  }

  playBeep();
  if (feedback) {
    feedback.style.display = "block";
    feedback.style.background = "#ecfdf5";
    feedback.style.color = "#047857";
    feedback.style.border = "1.5px solid #a7f3d0";
    const timeFmt = `${sH < 10 ? "0" + sH : sH}:${sM < 10 ? "0" + sM : sM} - ${eH < 10 ? "0" + eH : eH}:${eM < 10 ? "0" + eM : eM}`;
    const locNotice = parsedResult.location?.address ? `<br>📍 <i>Lieu : ${parsedResult.location.address}</i>` : "";
    feedback.innerHTML = `🎉 <b>Ajouté avec succès !</b><br>📚 <b>${parsedResult.subject}</b> planifié pour <b>${dayNamesFr[dayIdx]}</b> (${timeFmt})${locNotice}<br>${parsedResult.replyMessage ? `<i>💬 ${parsedResult.replyMessage}</i>` : ""}`;
  }
}

export async function callGeminiTunisianParser(userText, apiKey) {
  const modelName = getAiModelName();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const now = new Date();
  const currentDayName = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"][now.getDay()];

  const systemPrompt = `Tu es un assistant IA spécialisé pour les élèves du Baccalauréat tunisien.
Tu comprends parfaitement le dialecte tunisien (Derja en lettres arabes ou arabizi 3=ع, 7=ح, 9=ق, 5=خ), l'arabe classique et le français.
Aujourd'hui nous sommes ${currentDayName} ${now.toISOString().split("T")[0]}.
Analyse la phrase de l'élève et extrait les données en JSON STRICT sans formatage markdown :
{
  "action": "add_session" ou "add_exam",
  "subject": "Mathématiques" | "Sciences Physiques" | "Sciences SVT" | "Informatique" | "Philosophie" | "Arabe" | "Français" | "Anglais" | "Option",
  "dayIndex": nombre de 0 (Lundi) à 6 (Dimanche),
  "startHour": nombre de 8 à 22,
  "startMinute": nombre 0 ou 30,
  "endHour": nombre de 9 à 24,
  "endMinute": nombre 0 ou 30,
  "type": "À la maison" | "En ligne" | "Lycée" | "Particulier",
  "location": { "address": "nom du lieu ou ville (ex: Ennasr 2)", "lat": 36.8065, "lng": 10.1815 },
  "replyMessage": "Message de confirmation court et amical bilingue français/tunisien"
}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\nCommande élève : "${userText}"` }] }],
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
  if (/math|mathematique|رياضيات|مات|alg|geometrie/i.test(text)) subject = "Mathématiques";
  else if (/phys|physique|chimie|فيزياء|فيزيك|chim/i.test(text)) subject = "Sciences Physiques";
  else if (/svt|science|3ouloum|علوم|nature|bio/i.test(text)) subject = "Sciences SVT";
  else if (/info|informatique|tic|algo|python|انفورماتيك|اعلامية/i.test(text)) subject = "Informatique";
  else if (/philo|philosophie|falsafa|فلسفة/i.test(text)) subject = "Philosophie";
  else if (/arabe|3arbi|3arabia|عربية|نصوص|ادب/i.test(text)) subject = "Arabe";
  else if (/franc|french|فرنسية/i.test(text)) subject = "Français";
  else if (/angl|english|انقليزية/i.test(text)) subject = "Anglais";
  else if (/espagnol|italien|allemand|option|اسبانية/i.test(text)) subject = "Option";
  else if (/sport|رياضة/i.test(text)) subject = "Sport";

  if (!subject) return null;

  const now = new Date();
  let todayIdx = (now.getDay() + 6) % 7;
  let dayIndex = todayIdx;

  if (/ghodwa|demain|غدا|غدوة/i.test(text)) {
    dayIndex = (todayIdx + 1) % 7;
  } else if (/ba3d ghodwa|apres demain|après-demain|بعد غد/i.test(text)) {
    dayIndex = (todayIdx + 2) % 7;
  } else if (/lundi|ethnin|ithnin|الاثنين/i.test(text)) {
    dayIndex = 0;
  } else if (/mardi|thletha|tleta|الثلاثاء/i.test(text)) {
    dayIndex = 1;
  } else if (/mercredi|arba3a|lerba3|الأربعاء|الاربعاء/i.test(text)) {
    dayIndex = 2;
  } else if (/jeudi|khmis|elkhmis|الخميس/i.test(text)) {
    dayIndex = 3;
  } else if (/vendredi|jem3a|jom3a|الجمعة/i.test(text)) {
    dayIndex = 4;
  } else if (/samedi|sebt|essebt|السبت/i.test(text)) {
    dayIndex = 5;
  } else if (/dimanche|a7ad|elahad|الأحد|الاحد/i.test(text)) {
    dayIndex = 6;
  }

  let startHour = 14;
  let startMinute = 0;
  let endHour = 16;
  let endMinute = 0;

  const matchTime = text.match(/(?:m3a|a|à|fi|ساعة|مع)?\s*(\d{1,2})(?:h|:|\s*heures?)(\d{2})?/i);
  if (matchTime) {
    startHour = parseInt(matchTime[1]);
    if (matchTime[2]) startMinute = parseInt(matchTime[2]);
    if (startHour < 8) startHour += 12;
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

  const isExam = /devoir|examen|ds|dc|test|امتحان|فرض/i.test(text);

  const isPart = /particulier|etude|étude|dar el prof|chez prof|fi darou/i.test(text);
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
  } else if (/dar|maison|دار/i.test(text)) {
    sessionType = "À la maison";
  } else if (/ligne|zoom|meet|اونلاين/i.test(text)) {
    sessionType = "En ligne";
  } else if (/lycee|lycée|ecole|معهد/i.test(text)) {
    sessionType = "Lycée";
  }

  return {
    action: isExam ? "add_exam" : "add_session",
    subject: subject,
    dayIndex: dayIndex,
    startHour: startHour,
    startMinute: startMinute,
    endHour: endHour,
    endMinute: endMinute,
    type: sessionType,
    location: sessionLoc,
    replyMessage: isPart
      ? "فهمتك بالباهي ! تم تسجيل حصة الدرس الخصوصي مع تحديد الموقع على الخريطة بنجاح."
      : "فهمتك بالباهي ! تم تسجيل الحصة في جدول أوقاتك بنجاح.",
  };
}

export async function handleImageUpload(e) {
  if (state.isReadOnly) return alert("Accès en lecture seule.");
  const file = e.target.files?.[0];
  if (!file) return;

  const apiKey = getAiApiKey();
  showLoading("Analyse de l'image par Vision IA...");

  try {
    const reader = new FileReader();
    reader.onload = async function () {
      const base64Data = reader.result.split(",")[1];
      const modelName = getAiModelName();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: 'Analyse cet emploi du temps ou cette liste de séances tunisienne et extrait la liste des séances en JSON : [{"sub": "Mathématiques", "day": 0, "s": 480, "e": 600, "type": "Lycée"}]. Réponds STRICTEMENT en JSON sans markdown.',
                },
                {
                  inlineData: {
                    mimeType: file.type || "image/jpeg",
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (!res.ok) throw new Error("Erreur Gemini Vision " + res.status);
      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
      const sessions = JSON.parse(cleanJson);

      if (Array.isArray(sessions) && sessions.length > 0) {
        for (const s of sessions) {
          const newId = Date.now().toString() + Math.floor(Math.random() * 1000);
          await set(ref(database, getStudentPath("seances/" + newId)), {
            id: newId,
            sub: s.sub || "Mathématiques",
            day: s.day ?? 0,
            s: s.s ?? 480,
            e: s.e ?? 600,
            type: s.type || "Lycée",
            freq: "Chaque semaine",
          });
        }
        hideLoading();
        playBeep();
        alert(`🎉 ${sessions.length} séances importées avec succès dans votre planning !`);
      } else {
        hideLoading();
        alert("⚠️ Aucune séance n'a pu être détectée sur cette photo. Assurez-vous que l'image est bien nette.");
      }
    };
    reader.readAsDataURL(file);
  } catch (err) {
    hideLoading();
    alert("Erreur lors de l'analyse : " + err.message);
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
window.executeAiCommand = executeAiCommand;
window.handleImageUpload = handleImageUpload;
