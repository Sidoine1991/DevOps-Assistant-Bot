# Architecture - Deploiement et CI/CD

## Conteneurisation

- `Dockerfile` pour l'application Node.js
- `docker-compose.yml` pour app + ChromaDB

## Variables critiques

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- `CHROMA_URL`, `CHROMA_FALLBACK_URL`
- `RAG_ENABLED`, `RAG_COLLECTION`
- `GEMINI_API_KEY` ou `OPENAI_API_KEY`
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`

## Pipeline GitLab

- build: image Docker
- test: tests Node/Jest
- security: audit des dependances
- deploy: staging/production

## Resilience

- fallback local-rag quand provider cloud indisponible
- fallback endpoint Chroma secondaire
- restauration backup zip Chroma configurable
