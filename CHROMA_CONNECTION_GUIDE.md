# 🔧 Guide Connexion ChromaDB - Bot DevOps

## 🎯 Problème actuel

- ✅ ChromaDB déployé : https://chromadb-qow6.onrender.com
- ✅ Bot déployé : https://devops-assistant-bot-1wcp.onrender.com
- ❌ **RAG désactivé** : `"rag":{"enabled":false}`

## 🔍 Diagnostic effectué

### 1. ChromaDB Status ✅
```bash
curl https://chromadb-qow6.onrender.com/api/v2/heartbeat
# Réponse : {"nanosecond heartbeat":177502545739}
```

### 2. Bot Status ❌
```bash
curl https://devops-assistant-bot-1wcp.onrender.com/api/bot/status
# Réponse : "rag":{"enabled":false}
```

## 🚀 Solution immédiate

### Étape 1 : Mettre à jour les variables d'environnement Render

1. **Allez sur Render Dashboard** : https://dashboard.render.com
2. **Sélectionnez "devops-assistant-bot-1wcp"**
3. **Settings → Environment Variables**
4. **Ajoutez/Mettez à jour ces variables** :

```env
RAG_ENABLED=true
RAG_COLLECTION=devops_courses
CHROMA_URL=https://chromadb-qow6.onrender.com
CHROMA_FALLBACK_URL=http://localhost:8000
RAG_RETRIEVAL_TOP_K=16
RAG_MAX_CHUNKS_PER_DOC=1200
RAG_INGEST_BATCH_SIZE=4
```

### Étape 2 : Redéployer le bot

1. **Manual Deploy** → **Deploy Latest Commit**
2. **Attendez 2-3 minutes** pour le build

### Étape 3 : Vérifier la connexion

```bash
curl https://devops-assistant-bot-1wcp.onrender.com/api/bot/status
```

Devrait montrer :
```json
{
  "rag": {
    "enabled": true,
    "collection": "devops_courses",
    "chromaUrlConfigured": true
  }
}
```

## 🔧 Alternative : Re-créer le service

Si le problème persiste :

### Option A : Utiliser render-bot-only.yaml
1. Supprimez l'ancien service "devops-assistant-bot-1wcp"
2. **New → Blueprint** → Sélectionnez votre repository
3. Choisissez **render-bot-only.yaml**
4. Configurez les variables d'environnement

### Option B : Configuration manuelle
1. **New → Web Service**
2. Connectez votre repository GitHub
3. Configurez manuellement les variables ci-dessus

## 📊 Test de connexion RAG

Une fois configuré, testez :

```bash
# Test de récupération RAG
curl -X POST https://devops-assistant-bot-1wcp.onrender.com/api/rag/search \
  -H "Content-Type: application/json" \
  -d '{"query": "Docker deployment", "top_k": 5}'
```

## 🎯 Résultat attendu

Après configuration correcte :

1. **✅ RAG activé** : `"rag":{"enabled":true}`
2. **✅ Connexion Chroma** : `"chromaUrlConfigured":true`
3. **✅ Réponses enrichies** : Bot utilise les documents
4. **✅ Ingestion PDF** : `npm run rag:ingest` fonctionne

## 🚨 Dépannage

### Si RAG reste désactivé :
1. **Vérifiez les logs** : Render Dashboard → Logs
2. **Variables d'env** : Confirmez `RAG_ENABLED=true`
3. **URL Chroma** : Testez `curl https://chromadb-qow6.onrender.com/api/v2/heartbeat`

### Si erreur de connexion Chroma :
1. **Firewall** : Chroma doit écouter sur `0.0.0.0:8000`
2. **CORS** : Vérifiez que le bot peut appeler Chroma
3. **Timeout** : Render free tier a 15 secondes timeout

## 🔄 Workflow complet

1. **Configurer les variables** sur Render
2. **Redéployer** le bot
3. **Vérifier le status** API
4. **Tester une question** sur le bot
5. **Ingestérer des PDF** : `CHROMA_URL=https://chromadb-qow6.onrender.com npm run rag:ingest`

Votre bot utilisera alors ChromaDB pour des réponses enrichies ! 🎯✨
