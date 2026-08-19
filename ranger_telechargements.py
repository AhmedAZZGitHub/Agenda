import os
import shutil
import glob
import re

# Répertoires
dossier_telechargements = os.path.join(os.path.expanduser("~"), "Downloads")
dossier_racine = os.path.join(
    os.path.expanduser("~"), "Documents", "Projets", "agenda", "Bac_Math_2009_2026_Principale"
)

# Correspondance des noms du site reviserbac.tn vers nos dossiers
DOSSIERS_MAPPING = {
    "mathematiques": "01_Mathematiques",
    "physique": "02_Sciences_Physiques",
    "sciences_physiques": "02_Sciences_Physiques",
    "espagnol": "03_Option_Espagnol",
    "svt": "04_SVT",
    "sciences_de_la_vie": "04_SVT",
    "informatique": "05_Informatique",
    "francais": "06_Francais",
    "anglais": "07_Anglais",
    "philosophie": "08_Philosophie",
    "arabe": "09_Arabe"
}

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

        # 2. Identifier le dossier cible
        dossier_cible = None
        for cle, dossier_nom in DOSSIERS_MAPPING.items():
            if cle in nom_min:
                dossier_cible = dossier_nom
                break

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

if __name__ == "__main__":
    classer_fichiers()