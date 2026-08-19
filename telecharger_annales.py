import os
import re
import urllib.request
import urllib.parse
from bs4 import BeautifulSoup

DOSSIER_RACINE = "Bac_Math_2009_2026_Principale"
ANNEES = list(range(2009, 2027))

# Correspondances pour identifier les matières dans les liens ou libellés
FILTRES_MATIERES = {
    "01_Mathematiques": ["math", "maths", "mathematique", "رياضيات"],
    "02_Sciences_Physiques": ["physique", "chimie", "phy", "علوم فيزيائية", "فيزياء"],
    "03_Option_Espagnol": ["espagnol", "espagnole", "esp", "إسبانية", "اسبانية"],
    "04_SVT": ["svt", "naturelles", "sciences de la vie", "علوم الحياة"],
    "05_Informatique": ["info", "informatique", "tic", "اعلامية", "إعلامية"],
    "06_Francais": ["francais", "français", "french", "فرنسية"],
    "07_Anglais": ["anglais", "english", "ang", "انقليزية", "إنقليزية"],
    "08_Philosophie": ["philosophie", "philo", "فلسفة"],
    "09_Arabe": ["arabe", "arab", "عربية"]
}

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def initialiser_structure():
    for dossier in FILTRES_MATIERES.keys():
        os.makedirs(os.path.join(DOSSIER_RACINE, dossier), exist_ok=True)

def telecharger_pdf(url, chemin_destination):
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15) as reponse, open(chemin_destination, 'wb') as fichier:
            fichier.write(reponse.read())
        return True
    except Exception:
        return False

def scraper_et_telecharger():
    print("=" * 65)
    print("  SCRAPING ET TÉLÉCHARGEMENT - BAC MATHÉMATIQUES (2009 -> 2026)")
    print("=" * 65 + "\n")
    
    initialiser_structure()
    total_fichiers = 0

    for annee in reversed(ANNEES):
        print(f"\n🔍 Analyse de la session {annee}...")
        
        # Pages usuelles d'archives sur bacweb
        urls_session = [
            f"http://www.bacweb.tn/bac{annee}.htm",
            f"http://www.bacweb.tn/bac_{annee}.htm",
            f"http://www.bacweb.tn/{annee}/principale.htm",
            f"http://www.bacweb.tn/{annee}/"
        ]
        
        liens_trouves = []
        
        for url_page in urls_session:
            try:
                req = urllib.request.Request(url_page, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    html = resp.read().decode('utf-8', errors='ignore')
                    soup = BeautifulSoup(html, 'html.parser')
                    
                    for balise_a in soup.find_all('a', href=True):
                        href = balise_a['href']
                        texte = balise_a.get_text().strip()
                        if href.lower().endswith('.pdf'):
                            url_absolue = urllib.parse.urljoin(url_page, href)
                            liens_trouves.append((url_absolue, texte))
                    if liens_trouves:
                        break
            except Exception:
                continue

        if not liens_trouves:
            print(f"  [!] Session {annee} : portail interactif requis.")
            continue

        for url_pdf, texte in liens_trouves:
            texte_complet = f"{url_pdf} {texte}".lower()
            
            # Vérifier si le lien concerne la section Math ou une option
            for dossier, mots_cle in FILTRES_MATIERES.items():
                if any(mot in texte_complet for mot in mots_cle):
                    nom_fichier = os.path.basename(urllib.parse.urlparse(url_pdf).path)
                    if not nom_fichier.endswith('.pdf'):
                        nom_fichier = f"Bac_{annee}_{mots_cle[0]}.pdf"
                    else:
                        nom_fichier = f"Bac_{annee}_{nom_fichier}"

                    chemin_sortie = os.path.join(DOSSIER_RACINE, dossier, nom_fichier)
                    
                    if not os.path.exists(chemin_sortie):
                        if telecharger_pdf(url_pdf, chemin_sortie):
                            print(f"  [📥 Téléchargé] {dossier} : {nom_fichier}")
                            total_fichiers += 1
                    break

    print("\n" + "=" * 65)
    print(f"🎉 Analyse terminée : {total_fichiers} fichier(s) récupéré(s).")
    print("=" * 65)

if __name__ == "__main__":
    # Vérification de BeautifulSoup
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        print("⚠️ Installation de la bibliothèque 'beautifulsoup4' requise.")
        os.system("pip install beautifulsoup4")
        from bs4 import BeautifulSoup

    scraper_et_telecharger()