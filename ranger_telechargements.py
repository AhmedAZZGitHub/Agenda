import os
import shutil
import glob
import re
import json

# Répertoires
dossier_telechargements = os.path.join(os.path.expanduser("~"), "Downloads")
dossier_racine = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "Bac_Math_2009_2026_Principale"
)
fichier_manifest = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "bac_manifest.js"
)

# Correspondance ordonnée et précise des matières (priorité aux noms spécifiques d'abord)
MATIERES_CONFIG = [
    {"cle": "sciences_de_la_vie", "dossier": "04_SVT", "manifest_key": "svt"},
    {"cle": "svt", "dossier": "04_SVT", "manifest_key": "svt"},
    {"cle": "sciences_physiques", "dossier": "02_Sciences_Physiques", "manifest_key": "phys"},
    {"cle": "physique", "dossier": "02_Sciences_Physiques", "manifest_key": "phys"},
    {"cle": "informatique", "dossier": "05_Informatique", "manifest_key": "info"},
    {"cle": "espagnol", "dossier": "03_Option_Espagnol", "manifest_key": "option"},
    {"cle": "philosophie", "dossier": "08_Philosophie", "manifest_key": "philo"},
    {"cle": "philo", "dossier": "08_Philosophie", "manifest_key": "philo"},
    {"cle": "francais", "dossier": "06_Francais", "manifest_key": "franc"},
    {"cle": "anglais", "dossier": "07_Anglais", "manifest_key": "angl"},
    {"cle": "arabe", "dossier": "09_Arabe", "manifest_key": "arab"},
    {"cle": "mathematiques", "dossier": "01_Mathematiques", "manifest_key": "math"},
    {"cle": "math", "dossier": "01_Mathematiques", "manifest_key": "math"}
]

def generer_manifest():
    """Régénère bac_manifest.js en scannant les dossiers existants."""
    manifest_keys = {
        "01_Mathematiques": "math",
        "02_Sciences_Physiques": "phys",
        "03_Option_Espagnol": "option",
        "04_SVT": "svt",
        "05_Informatique": "info",
        "06_Francais": "franc",
        "07_Anglais": "angl",
        "08_Philosophie": "philo",
        "09_Arabe": "arab"
    }

    manifest = {k: {} for k in manifest_keys.values()}

    for folder_name, mkey in manifest_keys.items():
        dir_path = os.path.join(dossier_racine, folder_name)
        if not os.path.exists(dir_path):
            continue
        for fname in sorted(os.listdir(dir_path)):
            m = re.match(r'^Bac_(20\d\d)_(Sujet|Correction)\.pdf$', fname, re.IGNORECASE)
            if m:
                annee = m.group(1)
                typ = m.group(2).lower()
                rel_path = f"Bac_Math_2009_2026_Principale/{folder_name}/{fname}".replace("\\", "/")
                if annee not in manifest[mkey]:
                    manifest[mkey][annee] = {}
                manifest[mkey][annee][typ] = rel_path

    # Trier par année
    sorted_manifest = {k: dict(sorted(v.items())) for k, v in manifest.items()}

    content = "window.BAC_LOCAL_MANIFEST = " + json.dumps(sorted_manifest, indent=2, ensure_ascii=False) + ";\n"
    with open(fichier_manifest, "w", encoding="utf-8") as f:
        f.write(content)
    print("📋 bac_manifest.js actualisé avec succès.")

def classer_fichiers():
    fichiers_pdf = glob.glob(os.path.join(dossier_telechargements, "*.pdf"))
    print(f"📦 {len(fichiers_pdf)} fichier(s) PDF détecté(s) dans Téléchargements...\n")

    deplaces = 0
    supprimes = 0

    for fichier in fichiers_pdf:
        nom_base = os.path.basename(fichier)
        nom_min = nom_base.lower()

        # 1. Supprimer les doublons (ex: avec (1), (2), etc.)
        if re.search(r'\(\d+\)', nom_base):
            try:
                os.remove(fichier)
                print(f"🗑️ Doublon supprimé : {nom_base}")
                supprimes += 1
            except Exception as e:
                print(f"⚠️ Erreur suppression doublon {nom_base} : {e}")
            continue

        # 2. Identifier la matière par le début du nom de fichier (prioritaire) ou par mot clé
        dossier_cible = None
        
        # Si le fichier commence par une matière spécifique (ex: Francais_Mathematiques_...)
        for cfg in MATIERES_CONFIG:
            cle = cfg["cle"]
            # Vérifier si le mot-clé est au début ou avant "mathematiques"
            if nom_min.startswith(cle) or re.search(rf'\b{cle}\b', nom_min.split("mathematiques")[0] if "mathematiques" in nom_min else nom_min):
                dossier_cible = cfg["dossier"]
                break

        # Sinon vérifier le nom entier avec ordre de priorité
        if not dossier_cible:
            for cfg in MATIERES_CONFIG:
                if cfg["cle"] in nom_min and cfg["cle"] != "math" and cfg["cle"] != "mathematiques":
                    dossier_cible = cfg["dossier"]
                    break

        if not dossier_cible and ("mathematiques" in nom_min or "math" in nom_min):
            dossier_cible = "01_Mathematiques"

        if not dossier_cible:
            continue  # Ne touche pas aux fichiers PDF qui ne concernent pas le bac

        chemin_dossier_final = os.path.join(dossier_racine, dossier_cible)
        os.makedirs(chemin_dossier_final, exist_ok=True)

        # 3. Formater un nom propre (ex: Bac_2024_Sujet.pdf)
        annee_match = re.search(r'(20\d\d)', nom_base)
        annee = annee_match.group(1) if annee_match else ""
        
        type_doc = "Correction" if ("correction" in nom_min or "corrige" in nom_min) else "Sujet"
        nouveau_nom = f"Bac_{annee}_{type_doc}.pdf" if annee else nom_base

        destination_finale = os.path.join(chemin_dossier_final, nouveau_nom)

        # 4. Déplacement sécurisé
        try:
            shutil.move(fichier, destination_finale)
            print(f"✅ Classé dans [{dossier_cible}] : {nouveau_nom}")
            deplaces += 1
        except Exception as e:
            print(f"⚠️ Erreur déplacement {nom_base} : {e}")

    print("\n" + "=" * 55)
    print(f"🎉 Terminé ! {deplaces} fichier(s) rangé(s) par matière.")
    print(f"🗑️ {supprimes} doublon(s) nettoyé(s).")
    print(f"📁 Dossier de destination : {dossier_racine}")
    print("=" * 55)

    # Toujours actualiser le manifest JS
    generer_manifest()

if __name__ == "__main__":
    classer_fichiers()