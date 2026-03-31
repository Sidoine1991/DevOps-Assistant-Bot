# DevOps Assistant Bot

Application web de chatbot DevOps avec réponses IA, configuration multi-provider, stockage Supabase et enrichissement documentaire via RAG (Chroma + corpus PDF).

## Auteur

**YEBADOKPO Sidoine Kolaole**  
Etudiant beninois en DevOps dans le cadre de la bourse **Africa Tech Tour 2025**.  
Data Analyst et specialiste en suivi-evaluation de projet.  
Portfolio: [Portfolio Moderne - Sidoine YEBADOKPO](https://huggingface.co/spaces/Sidoineko/portfolio)

## Contexte du projet

Ce projet repond au livrable **"Deploiement d'Application avec CI/CD"** avec un objectif clair:  
fournir une application fonctionnelle, accessible en ligne, et correctement documentee sans sur-engineering.

Le projet couvre de bout en bout:
- le code applicatif
- la conteneurisation
- le versioning Git
- le pipeline CI/CD
- la documentation d'architecture (DAT)

## Objectif fonctionnel

Mettre a disposition un assistant DevOps capable de:
- repondre aux questions techniques (deploy, monitoring, troubleshooting, optimisation)
- utiliser des providers IA (Gemini/OpenAI)
- persister les conversations et configurations utilisateur
- s'appuyer sur un corpus documentaire de cours via RAG

## Stack technique reelle

- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: HTML/CSS/JavaScript (vanilla)
- **IA**: Google Gemini (principal) + OpenAI (optionnel)
- **RAG**: ChromaDB + embeddings Gemini + ingestion PDF
- **Base de donnees**: Supabase (PostgreSQL, RLS)
- **Conteneurisation**: Docker
- **CI/CD**: GitLab CI (`.gitlab-ci.yml`)
- **Deploiement cible**: Render (avec service applicatif + Chroma)

## Architecture simplifiee

```text
Client Web (UI Chat)
   <-> Socket.IO / API Express (Node.js)
         |- AIService (Gemini/OpenAI)
         |- RetrievalService (Chroma RAG)
         |- SupabaseService (conversations, metrics, logs)
         |- SupabaseConfigService (user_configs)
```

## Conformite aux exigences minimales

1. **Conteneurisation**
   - `Dockerfile` present
   - build image applicative possible

2. **Versioning du code**
   - repository Git versionne sur:
     - GitHub
     - GitLab

3. **CI/CD**
   - pipeline GitLab defini dans `.gitlab-ci.yml`
   - etapes: `build`, `test`, `security`, `deploy`

4. **Documentation DAT**
   - document principal: `DAT.md`
   - decrit architecture, pipeline, choix techniques, acces

## Lancement local rapide

### Prerequis
- Node.js 18+
- npm
- (optionnel) Docker pour ChromaDB

### Installation

```bash
npm install
```

### Configuration

Copier `.env.example` vers `.env` puis renseigner les variables principales:
- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `RAG_ENABLED=true`
- `RAG_COLLECTION=devops_courses`
- `CHROMA_HOST`
- `CHROMA_PORT`
- `CHROMA_SSL`

### Demarrage

```bash
npm start
```

Application accessible sur:
- `http://localhost:3000`

## RAG (documents PDF)

1. Lancer ChromaDB
2. Ajouter les PDF dans `data_course/`
3. Indexer les documents:

```bash
npm run rag:ingest
```

## Deploiement (Render)

Un blueprint est fourni:
- `render.yaml`

Le deploiement Render doit inclure:
- un service web Node.js pour l'application
- un service Chroma accessible depuis l'application
- les variables d'environnement (Gemini, Supabase, RAG/Chroma)

## CI/CD (GitLab)

Pipeline principal:
- **Build** image Docker
- **Test** Node.js
- **Security** (`npm audit`)
- **Deploy** staging/production (selon branche)

## Documentation complementaire

- `DAT.md` - Document d'Architecture Technique
- `SETUP.md` - installation/configuration
- `SUPABASE_SETUP.md` - configuration base de donnees
- `SUPABASE_CONFIG_GUIDE.md` - gestion des cles IA
- `DEPLOYMENT.md` - guide de deploiement

## Acces repository

- GitHub: `https://github.com/Sidoine1991/DevOps-Assistant-Bot`
- GitLab: `https://gitlab.com/sidoine1991-group/devops-assistant-bot`
