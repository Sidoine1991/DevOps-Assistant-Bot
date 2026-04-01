# Image chromadb/chroma récente : ENTRYPOINT = binaire `chroma` (CLI Rust).
# Sans ENTRYPOINT [], Docker exécute `chroma <CMD>` ; un CMD en forme shell devient
# `chroma sh -c ...` → erreur "unrecognized subcommand 'sh'".
#
# Render injecte PORT ; `chroma run` doit écouter sur ce port.
# Persistance sous /data (éphémère sur plan gratuit Render).
FROM chromadb/chroma:latest

ENTRYPOINT []

ENV CHROMA_LISTEN_ADDRESS=0.0.0.0
ENV CHROMA_PERSIST_PATH=/data

CMD ["sh", "-c", "exec chroma run --path /data --port ${PORT:-8000}"]
