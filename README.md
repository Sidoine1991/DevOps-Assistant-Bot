# 🚀 DevOps Assistant Bot

![CI](https://img.shields.io/badge/CI-GitLab-blue)
![Docker](https://img.shields.io/badge/Docker-ready-blue)
![Node](https://img.shields.io/badge/Node.js-18%2B-green)
![License](https://img.shields.io/badge/license-MIT-green)

Assistant DevOps intelligent combinant **IA + RAG + CI/CD** pour accompagner les développeurs, en particulier les débutants.

---

## 👤 Auteur

**YEBADOKPO Sidoine Kolaolé**  
Etudiant béninois en DevOps – Programme **Africa Tech Tour 2025**  
Data Analyst & spécialiste en suivi-évaluation de projets  
🔗 Portfolio : [Portfolio Moderne - Sidoine YEBADOKPO](https://huggingface.co/spaces/Sidoineko/portfolio)

---

## 🎯 Contexte & Objectif pédagogique

Ce projet est réalisé dans le cadre du livrable :  
**« Déploiement d’une application avec CI/CD »**

Objectif principal :
- livrer une **application fonctionnelle, déployée et documentée de bout en bout**
- éviter le sur-engineering : **solution simple, robuste, bien expliquée**

Le chatbot vise à :
- aider les **débutants en DevOps**
- expliquer les erreurs (CI/CD, Docker, déploiement…)
- guider pas à pas sur un projet réel

---

## 🤖 Pourquoi un chatbot DevOps spécialisé pour débutants ?

### 1️⃣ Trop d’outils et de concepts

Un débutant doit jongler avec :
- Docker
- CI/CD
- Cloud (Render, AWS…)
- Monitoring
- Git / GitLab

👉 Sans accompagnement, c’est rapidement confus.

### 2️⃣ Manque de feedback immédiat

Quand un pipeline échoue ou qu’un déploiement casse :
- les erreurs sont techniques
- les logs difficiles à lire

👉 Le chatbot :
- explique les erreurs
- propose des solutions concrètes

### 3️⃣ Apprentissage par la pratique

Le DevOps ne s’apprend pas seulement en théorie.

👉 Le chatbot :
- guide étape par étape
- adapte ses réponses au contexte du projet

### 4️⃣ Centralisation du savoir

Au lieu de chercher sur 10 sources (StackOverflow, docs, vidéos…) :

👉 le chatbot devient :
- un **assistant unique**
- **contextualisé** à ce projet

### 5️⃣ IA + Documentation (RAG)

Le projet combine :
- réponses IA (Gemini / OpenAI)
- documents PDF internes (RAG via ChromaDB)

👉 Résultat :
- réponses plus pertinentes
- adaptées aux cours DevOps utilisés pendant la formation

---

## 🧰 Stack technique

### Backend
- Node.js
- Express
- Socket.IO

### Frontend
- HTML
- CSS
- JavaScript (Vanilla)

### Intelligence artificielle
- Google Gemini (principal)
- OpenAI (optionnel)

### RAG (Retrieval Augmented Generation)
- ChromaDB
- Embeddings Gemini
- Ingestion de PDF dans `data_course/`

### Base de données
- Supabase (PostgreSQL + RLS)

### DevOps
- Docker
- Git / GitLab
- GitLab CI/CD
- Déploiement sur Render

---

## 🏗️ Architecture

```text
Client Web (Chat UI)
   ↓
API Node.js (Express + Socket.IO)
   ├── AIService (Gemini / OpenAI)
   ├── RetrievalService (RAG - Chroma)
   ├── SupabaseService (conversations, métriques, logs)
   └── SupabaseConfigService (configuration utilisateurs)
```

---

## ✅ Conformité aux exigences du projet

1. **Conteneurisation**
   - `Dockerfile` présent
   - image Node.js 18, user non-root, `npm start`

2. **Versioning**
   - Code versionné sur :
     - GitHub : `https://github.com/Sidoine1991/DevOps-Assistant-Bot`
     - GitLab : `https://gitlab.com/sidoine1991-group/devops-assistant-bot`

3. **Intégration & Déploiement continus (CI/CD)**
   - Pipeline GitLab (`.gitlab-ci.yml`) avec stages :
     - `build` (image Docker)
     - `test` (Jest + Postgres/Redis en service)
     - `security` (`npm audit`)
     - `deploy` (staging + production)

4. **Documentation (DAT)**
   - `DAT.md` : document d’architecture technique complet
   - Schémas d’architecture, pipeline CI/CD, choix techniques, URLs d’accès

---

## 🚀 Installation locale

### Prérequis
- Node.js 18+
- npm
- (optionnel) Docker pour ChromaDB

### Installation

```bash
npm install
```

### Configuration

```bash
cp .env.example .env
```

Variables principales à renseigner :
- `GEMINI_API_KEY=`
- `SUPABASE_URL=`
- `SUPABASE_ANON_KEY=`
- `RAG_ENABLED=true`
- `RAG_COLLECTION=devops_courses`
- `RAG_MAX_CHUNKS_PER_DOC=1200`
- `RAG_INGEST_BATCH_SIZE=16`
- `RAG_RETRIEVAL_TOP_K=16`
- `CHROMA_HOST=`
- `CHROMA_PORT=`
- `CHROMA_SSL=`
- `CHROMA_URL=` (optionnel, prioritaire sur host/port)
- `CHROMA_FALLBACK_URL=` (optionnel, endpoint secondaire)
- `RAG_CHROMA_BACKUP_URL=` (optionnel, URL Google Drive du zip de backup)
- `RAG_CHROMA_BACKUP_ZIP_PATH=` (optionnel, chemin local du zip)
- `ADMIN_EMAIL=syebadokpo@gmail.com`
- `SMTP_HOST=`
- `SMTP_PORT=587`
- `SMTP_USER=`
- `SMTP_PASS=`
- `SMTP_SECURE=false`
- `AUTH_CODE_TTL_MINUTES=10`

### Diagnostic configuration IA et mode degrade

- Si `SUPABASE_URL` ou `SUPABASE_ANON_KEY` manque, la route `/api/config/save` renvoie un code explicite (`SUPABASE_NOT_CONFIGURED`).
- Si la table `user_configs` est absente, le serveur renvoie `SUPABASE_TABLE_MISSING`.
- Si les policies RLS bloquent l'ecriture/lecture, le serveur renvoie `SUPABASE_POLICY_DENIED`.
- La page `configuration.html` bascule automatiquement en sauvegarde locale (IndexedDB) quand Supabase est indisponible.
- Le chat peut continuer a fonctionner avec cette configuration locale (mode degrade explicite cote UI).

### Lancement

```bash
npm start
```

Accès :
- `http://localhost:3000`

---

## 📚 RAG (documents PDF)

1. Lancer ChromaDB (en local ou via Docker)
2. Ajouter les fichiers PDF de cours dans `data_course/`
3. Lancer l’ingestion :

```bash
npm run rag:ingest
```

Le bot utilisera ensuite ces documents comme contexte pour ses réponses (et pourra citer les sources).

---

## ☁️ Déploiement (Render)

Un blueprint est fourni :
- `render.yaml`

Services attendus :
- Service **Node.js** pour l’application (`npm start`)
- Service **ChromaDB** accessible depuis Node

Variables d’environnement à configurer dans Render :
- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `RAG_ENABLED=true`
- `RAG_COLLECTION=devops_courses`
- `CHROMA_HOST`, `CHROMA_PORT`, `CHROMA_SSL`
- `CHROMA_URL` (ex: `http://127.0.0.1:8000`)
- `CHROMA_FALLBACK_URL` (ex: `http://127.0.0.1:8001`)
- `RAG_CHROMA_BACKUP_URL` (zip Drive)

---

## 🔄 CI/CD (GitLab)

Pipeline (`.gitlab-ci.yml`) :
- 🏗️ **Build** : build et push de l’image Docker
- 🧪 **Test** : exécution des tests Jest avec Postgres + Redis
- 🔐 **Security** : `npm audit --audit-level high`
- 🚀 **Deploy** :
  - staging (branche `develop`)
  - production (branche `main`, déploiement manuel)

---

## 📄 Documentation

- `DAT.md` → architecture technique détaillée
- `SETUP.md` → installation / configuration locale
- `SUPABASE_SETUP.md` → création et configuration des tables Supabase
- `SUPABASE_CONFIG_GUIDE.md` → gestion des clés IA
- `DEPLOYMENT.md` → guide de déploiement (GitLab / Docker / Render)

Des captures d’écran de l’interface se trouvent dans `media/` (démonstration du chatbot configuré et fonctionnel).

## 🖼️ Captures d'écran

> Les captures sont stockées dans le dossier `media/`.

### Écran d'accueil
![Accueil du bot](media/capt1.jpeg)

### Discussion et réponses
![Chatbot en conversation](media/capt2.jpeg)

### Configuration IA / Mode local RAG
![Page de configuration](media/capt3.jpeg)

## 📂 Knowledge Base utilisateur (upload dynamique)

- Quand un utilisateur envoie un document (pdf/txt/md/json/log), le backend :
  - extrait automatiquement le texte,
  - le découpe en `chunks`,
  - stocke ces chunks dans Supabase (`user_knowledge_chunks`),
  - réutilise ces chunks dans les prochaines réponses pour le même utilisateur.
- Migration SQL à exécuter dans Supabase :
  - `database/migrations/20260331_add_user_knowledge_chunks.sql`
- Variables utiles :
  - `USER_KNOWLEDGE_CHUNK_SIZE` (défaut `1200`)
  - `USER_KNOWLEDGE_CHUNK_OVERLAP` (défaut `150`)
  - `USER_KNOWLEDGE_MAX_CHUNKS_PER_DOC` (défaut `60`)

## 🔐 Authentification par code email

- Avant d'utiliser le bot, l'utilisateur doit :
  - saisir son nom + email,
  - recevoir un code de vérification,
  - valider ce code.
- Routes backend :
  - `POST /api/auth/request-code`
  - `POST /api/auth/verify-code`
- Le nombre d'utilisateurs connectés est exposé via :
  - `GET /api/users/connected`
- Migrations SQL à exécuter :
  - `database/migrations/20260331_add_users_and_auth_codes.sql`
  - `database/migrations/20260331_add_users_full_name.sql`
  - `database/migrations/20260331_add_user_knowledge_chunks.sql`
  - `database/migrations/20260331_fix_auth_rls_backend_access.sql`

## 🏠 Page d'accueil du projet

- La route `/` affiche maintenant une page de présentation du projet fil conducteur Africa Tech Tour 2025 (parcours DevOps).
- Le logo de l'application est affiché sur l'accueil.
- Navigation intégrée :
  - `Se connecter` -> `/index.html`
  - `S'inscrire` -> `/registration.html`

## Exploitation configuration IA

- Prerequis serveur Supabase pour la persistance distante :
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - table `user_configs` avec les colonnes `user_id`, `api_key`, `provider`, `updated_at`
- Si Supabase est indisponible (variables manquantes, table absente, policy RLS), l'application passe en mode degrade :
  - la page de configuration affiche un diagnostic actionnable (`SUPABASE_TABLE_MISSING`, `SUPABASE_POLICY_DENIED`, etc.)
  - la configuration est sauvegardee localement dans IndexedDB via `public/config-client.js`
- Cote chat, les reponses peuvent inclure des sources externes de reference (docs officielles DevOps / OpenClassrooms) affichees dans l'interface.

---

## 🔗 Repositories

- GitHub : `https://github.com/Sidoine1991/DevOps-Assistant-Bot`
- GitLab : `https://gitlab.com/sidoine1991-group/devops-assistant-bot`

---

## 🧩 Vision

Construire un assistant DevOps intelligent capable de :
- démocratiser l’apprentissage DevOps en Afrique
- accélérer la montée en compétence des débutants
- accompagner les développeurs sur des projets réels (CI/CD, Docker, Cloud)

Les contributions futures pourront porter sur :
- amélioration du RAG (plus de sources, meilleur ranking)
- ajout d’autres providers IA
- enrichissement du pipeline CI/CD et des dashboards de monitoring
