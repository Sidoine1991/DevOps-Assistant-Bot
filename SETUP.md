# Configuration de l'IA OpenAI

## Étape 1 : Obtenir une clé API OpenAI

1. Créez un compte sur https://platform.openai.com/
2. Allez dans "API Keys" → "Create new secret key"
3. Copiez votre clé (commence par `sk-...`)

## Étape 2 : Configurer la variable d'environnement

Créez un fichier `.env` à la racine du projet :

```bash
# Copiez le fichier d'exemple
cp .env.example .env
```

Éditez le fichier `.env` et ajoutez votre clé :

```env
OPENAI_API_KEY=sk-votre-clé-api-ici
```

## Étape 3 : Redémarrer l'application

```bash
# Arrêtez le serveur actuel (Ctrl+C)
# Puis redémarrez
npm start
```

## Étape 4 : Tester l'IA

Ouvrez http://localhost:3000 et testez des questions comme :

- "Comment déployer une application Node.js avec Docker ?"
- "J'ai une erreur 502 sur mon serveur, que faire ?"
- "Quelles sont les bonnes pratiques pour le monitoring ?"

## Fonctionnalités IA maintenant disponibles

✅ **Réponses intelligentes** : L'IA analyse votre demande et génère des réponses pertinentes
✅ **Contexte DevOps** : Spécialisé dans les déploiements, monitoring, erreurs
✅ **Gestion d'erreur** : Basculer automatiquement sur les réponses préprogrammées si l'IA n'est pas disponible
✅ **Prompts optimisés** : Questions rapides pour des réponses de qualité

## Coût

OpenAI GPT-3.5-turbo coûte environ $0.002 pour 1000 tokens.
Une conversation typique utilise 100-300 tokens = $0.0002-$0.0006 par réponse.

## Sécurité

- Votre clé API est stockée localement dans `.env`
- Le fichier `.env` est dans `.gitignore` (pas partagé sur Git)
- En production, utilisez les variables GitLab CI/CD
