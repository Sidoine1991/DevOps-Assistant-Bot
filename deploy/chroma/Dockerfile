# Image chromadb/chroma récente : ENTRYPOINT = binaire `chroma` (CLI Rust).
# Sans ENTRYPOINT [], Docker exécute `chroma <CMD>` ; un CMD en forme shell devient
# `chroma sh -c ...` → erreur "unrecognized subcommand 'sh'".
#
# Render injecte PORT ; le service doit écouter sur 0.0.0.0 (pas localhost), sinon
# "No open ports detected on 0.0.0.0" et health check en échec.
# Persistance sous /data (éphémère sur plan gratuit Render).
FROM chromadb/chroma:latest

ENTRYPOINT []

ENV CHROMA_PERSIST_PATH=/data

# Copier une page HTML simple pour le statut
COPY deploy/chroma/index.html /index.html

# Script de démarrage qui lance ChromaDB et crée une page de redirection
COPY deploy/chroma/start.sh /start.sh
RUN chmod +x /start.sh

CMD ["/start.sh"]
