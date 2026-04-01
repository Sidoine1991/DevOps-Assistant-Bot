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

CMD ["sh", "-c", "exec chroma run --path /data --host 0.0.0.0 --port ${PORT:-8000}"]
