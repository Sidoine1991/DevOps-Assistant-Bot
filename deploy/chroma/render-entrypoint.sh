#!/bin/sh
# Render injecte PORT ; l'image chromadb/chroma attend des arguments uvicorn via /docker_entrypoint.sh
# (pas la CLI "chroma run", absente ou incompatible avec l'ENTRYPOINT officiel).
set -e
export IS_PERSISTENT=1
export CHROMA_SERVER_NOFILE="${CHROMA_SERVER_NOFILE:-65536}"
PORT_VAL="${PORT:-8000}"
exec /docker_entrypoint.sh "--workers 1 --host 0.0.0.0 --port ${PORT_VAL} --proxy-headers --log-config chromadb/log_config.yml --timeout-keep-alive 30"
