# ChromaDB pour Render : écoute sur $PORT (injecté par Render), persistance sous /data.
# Sur le gratuit Render, /data est éphémère (perte au redémarrage). Pour un volume persistant,
# ajoutez un disque Render (plan payant) monté sur /data dans le tableau de bord ou dans le blueprint.
FROM chromadb/chroma:latest
CMD ["sh", "-c", "exec dumb-init -- chroma run --path /data --host 0.0.0.0 --port ${PORT:-8000}"]
