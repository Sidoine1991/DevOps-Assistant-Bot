# Guide de Déploiement - DevOps Assistant Bot

## Prérequis

- Compte GitLab avec accès aux CI/CD
- Docker installé localement
- Compte AWS (pour déploiement production)

## Étapes de déploiement

### 1. Créer le repository GitLab

1. Connectez-vous à GitLab
2. Créez un nouveau repository : `devops-assistant-bot`
3. Clonez le repository :
```bash
git clone https://gitlab.com/your-username/devops-assistant-bot.git
cd devops-assistant-bot
```

### 2. Pousser le code

```bash
git remote add origin https://gitlab.com/your-username/devops-assistant-bot.git
git push -u origin master
```

### 3. Configurer les variables CI/CD

Dans GitLab → Settings → CI/CD → Variables :

- `AWS_ACCESS_KEY_ID` : Votre clé d'accès AWS
- `AWS_SECRET_ACCESS_KEY` : Votre secret AWS
- `AWS_REGION` : `eu-west-3`
- `CI_REGISTRY_PASSWORD` : Token d'accès GitLab

### 4. Configurer les environnements

1. **Staging** : Déploie automatiquement depuis la branche `develop`
2. **Production** : Déploie manuellement depuis la branche `main`

### 5. Vérifier le pipeline

Le pipeline s'exécute automatiquement et comprend :
- Build de l'image Docker
- Tests unitaires
- Scan de sécurité
- Déploiement

### 6. Accéder à l'application

- **Staging** : https://staging.devops-assistant-bot.com
- **Production** : https://devops-assistant-bot.com

## Déploiement Local

Pour développement local :

```bash
# Démarrer tous les services
docker-compose up -d

# Vérifier les services
curl http://localhost:3000/health
```

## Monitoring

- **Grafana** : http://localhost:3001 (admin/admin)
- **Prometheus** : http://localhost:9090

## Dépannage

### Problèmes courants

1. **Port déjà utilisé**
```bash
netstat -ano | findstr :3000
taskkill /F /PID <PID>
```

2. **Tests qui échouent**
```bash
npm test -- --testPathPattern=simple
```

3. **Docker build failed**
```bash
docker system prune -f
docker-compose build --no-cache
```

### Logs

- Logs de l'application : `docker-compose logs app`
- Logs des tests : `npm test -- --verbose`
- Logs CI/CD : GitLab → CI/CD → Pipelines
