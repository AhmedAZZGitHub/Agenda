// js/maps.js
// Gestion des Cartes Interactives Leaflet pour les cours particuliers et Navigation GPS

import { state, getSubjectMeta, formatM } from "./state.js?v=15.2";

let pickerMap = null;
let pickerMarker = null;
let currentMapLat = 36.8065;
let currentMapLng = 10.1815;

let viewerMap = null;
let viewerMarker = null;

let sdDetailMap = null;
let sdDetailMarker = null;
let sdEditMap = null;
let sdEditMarker = null;

export function onSessionTypeChange(val) {
  const mapBox = document.getElementById("particularMapBox");
  if (val === "Particulier") {
    if (mapBox) mapBox.style.display = "flex";
    setTimeout(() => {
      initPickerMap(currentMapLat, currentMapLng);
    }, 150);
  } else {
    if (mapBox) mapBox.style.display = "none";
  }
}

export function initPickerMap(lat = 36.8065, lng = 10.1815) {
  const mapContainer = document.getElementById("sessionPickerMap");
  if (!mapContainer || typeof L === "undefined") return;

  if (!pickerMap) {
    pickerMap = L.map("sessionPickerMap").setView([lat, lng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(pickerMap);

    pickerMarker = L.marker([lat, lng], { draggable: true }).addTo(pickerMap);
    pickerMarker.on("dragend", function (e) {
      const pos = e.target.getLatLng();
      const latInp = document.getElementById("mLocationLat");
      const lngInp = document.getElementById("mLocationLng");
      if (latInp) latInp.value = pos.lat.toFixed(6);
      if (lngInp) lngInp.value = pos.lng.toFixed(6);
    });

    pickerMap.on("click", function (e) {
      pickerMarker.setLatLng(e.latlng);
      const latInp = document.getElementById("mLocationLat");
      const lngInp = document.getElementById("mLocationLng");
      if (latInp) latInp.value = e.latlng.lat.toFixed(6);
      if (lngInp) lngInp.value = e.latlng.lng.toFixed(6);
    });
  } else {
    pickerMap.invalidateSize();
    pickerMap.setView([lat, lng], 13);
    pickerMarker.setLatLng([lat, lng]);
  }
}

export function setMapPresetLocation(name, lat, lng) {
  currentMapLat = lat;
  currentMapLng = lng;
  const locTxt = document.getElementById("mLocationText");
  const latInp = document.getElementById("mLocationLat");
  const lngInp = document.getElementById("mLocationLng");

  if (locTxt) locTxt.value = name;
  if (latInp) latInp.value = lat.toFixed(6);
  if (lngInp) lngInp.value = lng.toFixed(6);
  initPickerMap(lat, lng);
}

export function getUserCurrentGps() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setMapPresetLocation("Ma position GPS actuelle", lat, lng);
      },
      (err) => {
        alert("Impossible de récupérer la position GPS : " + err.message);
      }
    );
  } else {
    alert("La géolocalisation n'est pas supportée par votre navigateur.");
  }
}

export function openMapViewer(sessionId) {
  const ev = state.db.find((e) => e.id === sessionId);
  if (!ev) return;

  const loc = ev.location || { address: "Cours Particulier", lat: 36.8065, lng: 10.1815 };
  const meta = getSubjectMeta(ev.sub);

  const titleEl = document.getElementById("mapViewerTitle");
  const addrEl = document.getElementById("mapViewerAddress");
  const timeEl = document.getElementById("mapViewerTime");
  const navBtn = document.getElementById("btnGoogleMapsNav");
  const copyBtn = document.getElementById("btnCopyMapAddr");

  if (titleEl) titleEl.innerText = `📍 ${meta.ico} ${ev.sub} (Cours Particulier)`;
  if (addrEl) addrEl.innerText = loc.address || "Cours Particulier";
  if (timeEl) timeEl.innerText = `🕒 ${state.days[ev.day]} de ${formatM(ev.s)} à ${formatM(ev.e)}`;

  if (navBtn) {
    navBtn.onclick = function () {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}`, "_blank");
    };
  }

  if (copyBtn) {
    copyBtn.onclick = function () {
      navigator.clipboard.writeText(loc.address || "Cours Particulier");
      alert("📋 Adresse copiée dans le presse-papier :\n" + (loc.address || "Cours Particulier"));
    };
  }

  window.openModal("mapViewerModal");

  setTimeout(() => {
    const container = document.getElementById("sessionViewerMap");
    if (!container || typeof L === "undefined") return;

    if (!viewerMap) {
      viewerMap = L.map("sessionViewerMap").setView([loc.lat, loc.lng], 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(viewerMap);

      viewerMarker = L.marker([loc.lat, loc.lng]).addTo(viewerMap);
    } else {
      viewerMap.invalidateSize();
      viewerMap.setView([loc.lat, loc.lng], 14);
      viewerMarker.setLatLng([loc.lat, loc.lng]);
    }
    viewerMarker.bindPopup(`<b>${meta.ico} ${ev.sub}</b><br>${loc.address || "Cours Particulier"}`).openPopup();
  }, 150);
}

export function initEditPickerMap(lat = 36.8065, lng = 10.1815) {
  const cont = document.getElementById("sdEditPickerMap");
  if (!cont || typeof L === "undefined") return;

  if (!sdEditMap) {
    sdEditMap = L.map("sdEditPickerMap").setView([lat, lng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(sdEditMap);

    sdEditMarker = L.marker([lat, lng], { draggable: true }).addTo(sdEditMap);
    sdEditMarker.on("dragend", function (e) {
      const pos = e.target.getLatLng();
      const latInp = document.getElementById("sdEditLocLat");
      const lngInp = document.getElementById("sdEditLocLng");
      if (latInp) latInp.value = pos.lat.toFixed(6);
      if (lngInp) lngInp.value = pos.lng.toFixed(6);
    });

    sdEditMap.on("click", function (e) {
      sdEditMarker.setLatLng(e.latlng);
      const latInp = document.getElementById("sdEditLocLat");
      const lngInp = document.getElementById("sdEditLocLng");
      if (latInp) latInp.value = e.latlng.lat.toFixed(6);
      if (lngInp) lngInp.value = e.latlng.lng.toFixed(6);
    });
  } else {
    sdEditMap.invalidateSize();
    sdEditMap.setView([lat, lng], 13);
    sdEditMarker.setLatLng([lat, lng]);
  }
}

export function renderDetailSessionMap(loc, meta, sub) {
  setTimeout(() => {
    const mapCont = document.getElementById("sdDetailMap");
    if (mapCont && typeof L !== "undefined") {
      if (!sdDetailMap) {
        sdDetailMap = L.map("sdDetailMap").setView([loc.lat, loc.lng], 14);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 19,
        }).addTo(sdDetailMap);
        sdDetailMarker = L.marker([loc.lat, loc.lng]).addTo(sdDetailMap);
      } else {
        sdDetailMap.invalidateSize();
        sdDetailMap.setView([loc.lat, loc.lng], 14);
        sdDetailMarker.setLatLng([loc.lat, loc.lng]);
      }
      sdDetailMarker.bindPopup(`<b>${meta.ico} ${sub}</b><br>${loc.address || "Cours Particulier"}`).openPopup();
    }
  }, 150);
}

// Global Window Bindings
window.onSessionTypeChange = onSessionTypeChange;
window.initPickerMap = initPickerMap;
window.setMapPresetLocation = setMapPresetLocation;
window.getUserCurrentGps = getUserCurrentGps;
window.openMapViewer = openMapViewer;
window.initEditPickerMap = initEditPickerMap;
