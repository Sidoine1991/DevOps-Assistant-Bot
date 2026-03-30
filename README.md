# DevOps Assistant Bot

## Description
Chatbot intelligent qui assiste les développeurs dans les tâches DevOps : déploiement, monitoring, gestion des erreurs.

## Architecture
```
Frontend (React) ←→ API Gateway ←→ Bot Service (Python/Rasa)
                                    ↓
                            Command Engine (Node.js)
                                    ↓
                            Docker/Kubernetes API
                                    ↓
                            Monitoring Stack (Prometheus)
```

## Technologies
- **Backend**: Python (Rasa) + Node.js
- **Frontend**: React + Material-UI
- **Base**: PostgreSQL + Redis
- **Containerisation**: Docker + Docker Compose
- **CI/CD**: GitLab CI/CD
- **Monitoring**: Prometheus + Grafana
- **Déploiement**: AWS ECS

## Fonctionnalités
- Compréhension naturelle des commandes DevOps
- Suggestions proactives d'optimisation
- Auto-diagnostic des problèmes de déploiement
- Génération automatique de rapports

## Installation
```bash
docker-compose up -d
```

## Usage
Accédez à l'application sur http://localhost:3000
