#!/bin/bash
set -e

# Render injecte PORT pour le health check et le routage HTTPS.
PORT_NUM="${PORT:-8000}"
echo "🚀 Chroma écoute sur 0.0.0.0:${PORT_NUM} (PORT Render ou défaut 8000)"

echo "📊 Démarrage de ChromaDB..."
chroma run --path /data --host 0.0.0.0 --port "${PORT_NUM}" &
CHROMA_PID=$!

# L'image chromadb/chroma ne contient pas curl/wget : on teste le port avec bash (/dev/tcp).
echo "⏳ Attente que Chroma réponde sur le port ${PORT_NUM}..."
sleep 2

port_listening() {
  { echo >/dev/tcp/127.0.0.1/"${PORT_NUM}"; } 2>/dev/null
}

ready=0
i=0
while [ "$i" -lt 120 ]; do
  if port_listening; then
    echo "✅ Port ${PORT_NUM} ouvert (Chroma démarré)"
    ready=1
    break
  fi
  i=$((i + 1))
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "⚠️ Timeout en attendant le port — le processus Chroma continue ; Render testera /api/v2/heartbeat."
fi

echo "🔄 ChromaDB en cours d'exécution (PID ${CHROMA_PID})..."
wait "$CHROMA_PID"
