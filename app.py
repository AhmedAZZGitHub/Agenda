import os
import webview

# Recherche le fichier HTML dans le dossier
files = [f for f in os.listdir('.') if f.endswith('.html')]
html_file = files[0] if files else 'agenda.html'
html_path = os.path.abspath(html_file)

window = webview.create_window(
    title="Mon Planning Bac",
    url=f"file://{html_path}",
    width=1380,
    height=820,
    resizable=True,
    min_size=(950, 600)
)

webview.start()
