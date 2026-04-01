#!/bin/bash

# Script de démarrage pour ChromaDB avec page de statut
echo "🚀 Démarrage de ChromaDB avec interface web..."

# Démarrer ChromaDB en arrière-plan
echo "📊 Démarrage de ChromaDB..."
chroma run --path /data --host 0.0.0.0 --port 8000 &
CHROMA_PID=$!

# Attendre que ChromaDB soit prêt
echo "⏳ Attente de ChromaDB..."
sleep 3

# Créer une simple page de statut avec curl
echo "🌐 Test de connexion ChromaDB..."
while true; do
    # Vérifier que ChromaDB répond
    if curl -s http://localhost:8000/api/v2/heartbeat > /dev/null; then
        echo "✅ ChromaDB est actif"
        break
    fi
    sleep 1
done

# Garder le processus principal en vie
echo "🔄 ChromaDB est en cours d'exécution..."
wait $CHROMA_PID
