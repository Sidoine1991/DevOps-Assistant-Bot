# Architecture - Composants

## Backend principal

- `src/index.js`: routes REST, websocket, orchestration des services
- `src/ai-service.js`: generation de reponses, synthese locale RAG
- `src/auth-service.js`: OTP email, verification utilisateur

## RAG

- `src/rag/ingest-pdfs.js`: ingestion corpus `data_course/`
- `src/rag/retrieval-service.js`: retrieval Chroma avec diversification des sources
- `src/rag/chroma-backup-manager.js`: restauration de backup zip

## Connaissances utilisateur

- `src/user-knowledge-service.js`: extraction, chunking, ranking et contexte
- table Supabase `user_knowledge_chunks`

## Persistance et configuration

- `src/supabase-service.js`: conversations, logs, metrics, users, auth codes
- `src/supabase-config-service.js`: configuration provider/cle API utilisateur

## Frontend

- `public/login.html`, `public/registration.html`, `public/index.html`
- `public/script.js`: chat, upload fichiers, socket events
