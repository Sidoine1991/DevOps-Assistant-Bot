# Document d'Architecture Technique (DAT)

## 1. Description Générale du Projet

### 1.1 Nom du projet
DevOps Assistant Bot

### 1.2 Objectif
Développer un chatbot intelligent qui assiste les développeurs dans leurs tâches DevOps quotidiennes : déploiement, monitoring, gestion des erreurs et optimisation des infrastructures.

### 1.3 Innovation
- Intelligence artificielle conversationnelle spécialisée DevOps
- Auto-diagnostic des problèmes d'infrastructure
- Suggestions proactives d'optimisation basées sur l'apprentissage

## 2. Architecture Technique

### 2.1 Schéma d'architecture global
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Frontend  │    │ API Gateway │    │ Bot Service │
│   (React)   │◄──►│  (Express)  │◄──►│ (Python)    │
└─────────────┘    └─────────────┘    └─────────────┘
                                             │
                                      ┌──────┴──────┐
                                      │ Command     │
                                      │ Engine      │
                                      │ (Node.js)   │
                                      └──────┬──────┘
                                             │
        ┌─────────────┐    ┌─────────────┐   │   ┌─────────────┐
        │ Supabase    │    │    Redis    │◄──┼──►│   OpenAI    │
        │ (PostgreSQL)│    │   (Cache)   │   │   │   API       │
        └─────────────┘    └─────────────┘   │   └─────────────┘
                                             │
                                      ┌──────┴──────┐
                                      │ Monitoring  │
                                      │ (Prometheus)│
                                      └─────────────┘
```

### 2.2 Composants techniques

#### 2.2.1 Frontend
- **Technologie**: HTML5 + CSS3 + JavaScript (vanilla)
- **Fonction**: Interface utilisateur pour le chatbot
- **Communication**: WebSocket avec le backend

#### 2.2.2 Backend Principal
- **Technologie**: Node.js + Express
- **Fonction**: API RESTful et gestion des connexions WebSocket
- **Port**: 3000

#### 2.2.3 Service IA
- **Technologie**: OpenAI GPT-3.5-turbo
- **Fonction**: Traitement du langage naturel et intelligence artificielle
- **Intégration**: API REST avec configuration utilisateur

#### 2.2.4 Base de données
- **Supabase**: PostgreSQL hébergé avec RLS
- **Tables**: conversations, user_configs, system_metrics, error_logs
- **Redis**: Cache et gestion des sessions en temps réel

#### 2.2.5 Monitoring
- **Prometheus**: Collecte de métriques
- **Grafana**: Visualisation des dashboards

## 3. Pipeline CI/CD

### 3.1 Étapes du pipeline
1. **Build**: Construction de l'image Docker
2. **Test**: Tests unitaires et d'intégration
3. **Security**: Scan de vulnérabilités
4. **Deploy**: Déploiement automatique en staging/production

### 3.2 Outils
- **GitLab CI/CD**: Orchestration du pipeline
- **Docker**: Conteneurisation
- **GitLab Registry**: Stockage des images

### 3.3 Environnements
- **Staging**: Déploiement automatique depuis la branche develop
- **Production**: Déploiement manuel depuis la branche main

## 4. Base de Données Supabase

### 4.1 Architecture des données
```
Supabase (PostgreSQL)
├── conversations (chat history)
├── user_configs (preferences)
├── system_metrics (performance)
├── error_logs (debugging)
├── user_sessions (auth)
├── user_feedback (ratings)
└── usage_analytics (tracking)
```

### 4.2 Sécurité des données
- **RLS (Row Level Security)**: Isolation des données utilisateur
- **Anonymisation**: Protection des informations sensibles
- **Backup automatique**: Sauvegarde quotidienne Supabase

### 4.3 Monitoring des données
- **Métriques temps réel**: CPU, mémoire, disque
- **Analytics**: Utilisation et performance
- **Logs**: Erreurs et debugging

## 5. Choix Techniques et Justifications

### 5.1 Node.js pour le backend principal
**Justification**: Performance élevée pour les applications temps réel, écosystème riche, support natif de WebSocket.

### 5.2 OpenAI pour l'IA
**Justification**: API stable et documentée, réponses de haute qualité, coût prévisible, spécialisation DevOps possible via prompts.

### 5.3 Supabase pour la base de données
**Justification**: PostgreSQL natif, RLS intégré, API REST automatique, monitoring intégré, scalabilité automatique.

### 5.4 Docker pour la conteneurisation
**Justification**: Standard industriel, portabilité, isolation des dépendances, intégration parfaite avec les outils DevOps.

### 5.5 GitLab CI/CD
**Justification**: Intégration native avec GitLab, support complet des pipelines DevOps, gratuit pour les projets open-source.

## 6. Déploiement et Infrastructure

### 6.1 Architecture de déploiement
- **Plateforme**: AWS ECS (Elastic Container Service)
- **Base de données**: Supabase (géré)
- **Load Balancer**: Application Load Balancer
- **Cache**: AWS ElastiCache for Redis
- **Monitoring**: AWS CloudWatch + Prometheus

### 6.2 Configuration réseau
- **VPC**: Isolation réseau
- **Subnets**: Public pour le load balancer, privé pour les applications
- **Security Groups**: Contrôle d'accès granulaire

## 7. Sécurité

### 7.1 Mesures de sécurité
- **HTTPS**: TLS 1.3 pour toutes les communications
- **Authentification**: JWT tokens pour les API
- **Variables d'environnement**: Secrets stockés dans AWS Secrets Manager
- **Scanning automatique**: Vulnérabilités analysées à chaque build
- **RLS Supabase**: Isolation des données au niveau base de données

### 7.2 Gestion des clés API
- **Stockage local**: Clés utilisateur dans localStorage
- **Validation**: Format et validité des clés vérifiés
- **Fallback**: Mode dégradé si API indisponible

## 8. Monitoring et Logging

### 8.1 Métriques surveillées
- Performance du bot (temps de réponse)
- Utilisation des ressources (CPU, mémoire)
- Disponibilité des services
- Satisfaction utilisateur (feedback)
- Analytics d'utilisation

### 8.2 Logs structurés
- Format JSON
- Niveaux de log (DEBUG, INFO, WARN, ERROR)
- Agrégation centralisée dans Supabase
- Export vers Prometheus

## 9. Accès à l'Application

### 9.1 URLs d'accès
- **Local**: http://localhost:3000
- **Configuration**: http://localhost:3000/config
- **Production**: https://devops-assistant-bot.com
- **Staging**: https://staging.devops-assistant-bot.com

### 9.2 Accès base de données
- **Supabase Dashboard**: https://supabase.com/dashboard/project/bpzqnooiisgadzicwupi
- **Connection String**: Configurée dans DATABASE_URL

## 10. Scalabilité et Performance

### 10.1 Scalabilité horizontale
- Conteneurs orchestrés par ECS
- Auto-scaling basé sur le CPU et le nombre de connexions
- Base de données Supabase avec read replicas automatiques

### 10.2 Optimisations
- Cache Redis pour les requêtes fréquentes
- Connection pooling pour la base de données
- CDN pour les assets statiques
- Compression des réponses WebSocket

## 11. Maintenance et Évolutions

### 11.1 Stratégie de maintenance
- Mises à jour rolling sans downtime
- Backups automatiques quotidiens (Supabase)
- Monitoring proactif des performances
- Nettoyage automatique des anciennes données

### 11.2 Roadmap d'évolution
- Phase 1: MVP avec IA OpenAI 
- Phase 2: Intégration Supabase complète 
- Phase 3: Analytics avancés et dashboard
- Phase 4: Multi-fournisseurs IA (Gemini, Claude)
- Phase 5: Auto-guérison des infrastructures

## 12. Documentation et Support

### 12.1 Documentation technique
- **DAT**: Document d'architecture technique (ce fichier)
- **SETUP.md**: Guide d'installation et configuration
- **SUPABASE_SETUP.md**: Configuration base de données
- **DEPLOYMENT.md**: Guide de déploiement

### 12.2 Support utilisateur
- **Interface configuration**: Guide intégré pour les clés API
- **Messages d'erreur**: Clairs et actionnables
- **Fallback**: Mode dégradé fonctionnel
- **Feedback**: Système d'évaluation intégré
