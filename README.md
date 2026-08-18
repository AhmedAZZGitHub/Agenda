# 🎓 Planning & Tableau de Bord Baccalauréat

Application web et bureau moderne de gestion d'emploi du temps, de suivi scolaire et de révision pour les candidats au Baccalauréat, avec gestion multi-comptes (**Élève**, **Parent**, **Administrateur**) et synchronisation temps réel via **Firebase**.

---

## 🌟 Fonctionnalités Principales

### 1. 🎓 Espace Élève
* **Planning Interactif** : Vue hebdomadaire PC (8h - 24h) et vue Liste Mobile réactive avec statuts en direct (*En cours*, *Fait*).
* **Gestionnaire d'Examens & DS** : Suivi des devoirs surveillés, synthèses et Bac Blanc avec compte à rebours.
* **Carnet de Notes & Calculateur Trimestriel** : Calcul automatique des moyennes avec coefficients officiels et modulation Oral/TP.
* **Annales du Baccalauréat (2000 → 2026)** : 27 sujets par matière avec suivi de réalisation, favoris, liens PDF et notes de révision.
* **Minuteur de Concentration & Streaks** : Suivi de l'assiduité du travail à la maison.
* **Intelligence Artificielle (Gemini API)** : Scanner d'emploi du temps par photo et saisie vocale par micro.
* **Liaison Parent** : Génération d'un code unique de liaison (`BAC-XXXX`) pour autoriser le suivi parental.

### 2. 👨‍👩‍👧 Espace Parent
* **Accès Multi-Enfants** : Association d'un ou plusieurs élèves via leur code de liaison.
* **Consultation en Temps Réel (Lecture Seule)** :
  * Emploi du temps en direct de l'enfant.
  * Devoirs et examens à venir.
  * Notes, bulletins et moyennes trimestrielles.
  * Volume de travail en autonomie et régularité (streaks).

### 3. 🛡️ Espace Administrateur
* **Console d'Administration & Supervision** :
  * Indicateurs clés (KPIs) : total utilisateurs, élèves, parents, séances actives.
  * Gestion et modération des comptes avec recherche et suppression.
  * **Outil d'inspection directe** : visualisation du planning de n'importe quel élève.
  * **Système d'Annonces Globales** : diffusion de messages officiels et alertes à tous les utilisateurs.

---

## 🛠️ Technologies Utilisées
* **Frontend** : HTML5, Vanilla CSS3 (Variables CSS, Dark Mode, Glassmorphism), JavaScript (ES Modules).
* **Backend & Base de données** : Firebase Realtime Database & Firebase Authentication.
* **Intelligence Artificielle** : Google Generative AI SDK (Gemini Flash).
* **Desktop Wrapper** : Python 3 & PyWebView (`app.py`).

---

## 🚀 Démarrage Rapide

### 1. Lancement dans le navigateur
Double-cliquez simplement sur `index.html` ou ouvrez-le avec votre navigateur préféré.

### 2. Lancement avec serveur local Python
```bash
python -m http.server 8000
```
Puis accédez à `http://localhost:8000`.

### 3. Lancement sous forme d'application Bureau
```bash
pip install pywebview
python app.py
```
