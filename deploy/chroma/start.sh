#!/bin/bash
set -e

# Render (et autres PaaS) définissent PORT : le health check interne cible ce port.
# Si Chroma écoute sur 8000 alors que Render attend 3000 → "Timed out ... :3000/api/v2/heartbeat".
PORT_NUM="${PORT:-8000}"
echo "🚀 Chroma écoute sur 0.0.0.0:${PORT_NUM} (PORT Render ou défaut 8000)"

# Démarrer ChromaDB en arrière-plan
echo "📊 Démarrage de ChromaDB..."
chroma run --path /data --host 0.0.0.0 --port "${PORT_NUM}" &
CHROMA_PID=$!

# Attendre que ChromaDB soit prêt
echo "⏳ Attente de ChromaDB..."
sleep 3

# Créer une simple page de statut avec curl
echo "🌐 Test de connexion ChromaDB..."
while true; do
    # Vérifier que ChromaDB répond
    if curl -s "http://localhost:${PORT_NUM}/api/v2/heartbeat" > /dev/null; then
        echo "✅ ChromaDB est actif"
        break
    fi
    sleep 1
done

# Garder le processus principal en vie
echo "🔄 ChromaDB est en cours d'exécution..."
wait $CHROMA_PID
