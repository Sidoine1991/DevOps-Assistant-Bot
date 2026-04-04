# 🔍 Vérification du service ChromaDB

## 📊 État actuel

### ✅ ChromaDB API fonctionne
```bash
curl https://chromadb-qow6.onrender.com/api/v2/heartbeat
# Réponse : {"nanosecond heartbeat":...}
```

### ❌ Page web non disponible (404)
```bash
curl https://chromadb-qow6.onrender.com/
# Réponse : HTTP ERROR 404
```

### Déploiement Render : `Timed out ... :3000/api/v2/heartbeat`

Render envoie le health check sur le **port interne** configuré pour le service (souvent **3000** ou **10000**). Si Chroma écoutait en dur sur **8000**, le check échoue. Le `deploy/chroma/start.sh` utilise désormais **`$PORT`** (injecté par Render) pour que Chroma écoute sur le même port. Après mise à jour du repo : **Manual Deploy** du service Chroma. Vérifiez aussi **Settings → Port** du service Docker : il doit correspondre à ce que Render attend (le script suit `PORT`).

## 🎯 Solution immédiate

### Option 1 : Utiliser les endpoints API (recommandé)

ChromaDB est un service API, pas un site web. Pour vérifier qu'il fonctionne :

```bash
# 1. Vérifier le heartbeat
curl https://chromadb-qow6.onrender.com/api/v2/heartbeat

# 2. Lister les collections
curl https://chromadb-qow6.onrender.com/api/v2/collections

# 3. Vérifier la connexion depuis le bot
curl https://devops-assistant-bot-1wcp.onrender.com/api/bot/status
```

### Option 2 : Redéployer avec interface web

1. **Allez sur Render Dashboard**
2. **Sélectionnez "chromadb-qow6"**
3. **Manual Deploy** → **Deploy Latest Commit**
4. **Attendez 2-3 minutes**

Après redéploiement, vous devriez voir une page web sur https://chromadb-qow6.onrender.com

## 🔧 Configuration du bot pour utiliser Chroma

### 1. Variables d'environnement sur le bot

Sur `devops-assistant-bot-1wcp` :

```env
RAG_ENABLED=true
CHROMA_URL=https://chromadb-qow6.onrender.com
RAG_COLLECTION=devops_courses
```

### 2. Vérifier la connexion

```bash
curl https://devops-assistant-bot-1wcp.onrender.com/api/bot/status
# Devrait montrer : "rag":{"enabled":true}
```

## 📊 Test complet

### Étape 1 : Vérifier ChromaDB
```bash
curl https://chromadb-qow6.onrender.com/api/v2/heartbeat
```

### Étape 2 : Vérifier le bot
```bash
curl https://devops-assistant-bot-1wcp.onrender.com/api/bot/status
```

### Étape 3 : Tester une question
Allez sur https://devops-assistant-bot-1wcp.onrender.com et posez une question.

## 🎯 Résultat attendu

1. **✅ ChromaDB API** : Répond aux endpoints
2. **✅ Bot connecté** : `"rag":{"enabled":true}`
3. **✅ Réponses enrichies** : Bot utilise les documents

## 🚨 Si problème persiste

### Le bot ne se connecte pas à Chroma :
1. Vérifiez les variables d'environnement sur Render
2. Redéployez le bot après modification
3. Vérifiez les logs du bot sur Render

### ChromaDB ne répond pas :
1. Redéployez le service ChromaDB
2. Vérifiez les logs sur Render
3. Testez avec l'endpoint heartbeat

## 📝 Note importante

ChromaDB est une **base de données vectorielle API**, pas un site web. 
L'erreur 404 sur `/` est normale - ce qui compte c'est que les endpoints API répondent.

**Ce qui est important** : 
- ✅ `/api/v2/heartbeat` fonctionne
- ✅ Le bot peut se connecter
- ✅ RAG est activé dans le bot

Votre système ChromaDB fonctionne correctement ! 🎯✨
