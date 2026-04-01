# ChromaDB pour Render : même stack que l'image officielle (uvicorn + chromadb.app:app),
# avec le PORT injecté par Render (obligatoire sur la plateforme).
# Persistance : par défaut sous /chroma/chroma dans l'image (voir docker-compose officiel Chroma).
# Sur plan Render gratuit, le filesystem est éphémère.
#
# Ne pas utiliser `chroma run` ici : l'ENTRYPOINT parent est /docker_entrypoint.sh ; un CMD
# qui le remplace par `chroma run` casse le démarrage (échec health check / crash).
FROM chromadb/chroma:1.5.5

COPY deploy/chroma/render-entrypoint.sh /render-entrypoint.sh
RUN chmod +x /render-entrypoint.sh

ENTRYPOINT ["/render-entrypoint.sh"]
