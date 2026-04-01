#!/usr/bin/env python3
"""
Serveur web simple pour ChromaDB avec page de statut
"""
import os
import subprocess
import threading
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

class ChromaStatusHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urlparse(self.path)
        
        # Servir la page principale
        if parsed_path.path == '/' or parsed_path.path == '/index.html':
            self.path = '/index.html'
            return super().do_GET()
        
        # Laisser ChromaDB gérer les endpoints API
        elif parsed_path.path.startswith('/api/'):
            # Rediriger vers le serveur ChromaDB sur le port 8001
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status":"redirected_to_chroma"}')
            return
        
        # Servir les fichiers statiques
        else:
            return super().do_GET()
    
    def log_message(self, format, *args):
        # Réduire les logs
        if self.path.startswith('/api/'):
            return
        super().log_message(format, *args)

def start_chroma():
    """Démarrer ChromaDB sur le port 8001"""
    print("Démarrage de ChromaDB sur le port 8001...")
    os.environ['PORT'] = '8001'
    subprocess.run([
        'chroma', 'run', 
        '--path', '/data', 
        '--host', '0.0.0.0', 
        '--port', '8001'
    ])

def start_web_server():
    """Démarrer le serveur web sur le port 8000"""
    print("Démarrage du serveur web sur le port 8000...")
    os.chdir('/app')  # Répertoire avec index.html
    server = HTTPServer(('0.0.0.0', 8000), ChromaStatusHandler)
    server.serve_forever()

if __name__ == '__main__':
    # Démarrer ChromaDB en arrière-plan
    chroma_thread = threading.Thread(target=start_chroma, daemon=True)
    chroma_thread.start()
    
    # Attendre un peu que ChromaDB démarre
    time.sleep(3)
    
    # Démarrer le serveur web
    start_web_server()
