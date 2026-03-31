# Configuration Supabase pour DevOps Assistant Bot

## 📋 Étapes de configuration

### 1. Créer les tables dans Supabase

1. Allez sur votre projet Supabase : https://supabase.com/dashboard/project/bpzqnooiisgadzicwupi
2. Cliquez sur "SQL Editor" dans le menu latéral
3. Copiez-collez le contenu du fichier `database/schema.sql`
4. Cliquez sur "Run" pour exécuter le script

### 2. Vérifier la création des tables

Les tables suivantes seront créées :
- ✅ `conversations` - Stocke toutes les conversations
- ✅ `user_configs` - Configurations utilisateur
- ✅ `system_metrics` - Métriques de performance
- ✅ `error_logs` - Logs d'erreurs
- ✅ `user_sessions` - Sessions utilisateur
- ✅ `user_feedback` - Feedbacks utilisateurs
- ✅ `usage_analytics` - Analytics d'utilisation

### 3. Variables d'environnement déjà configurées

```env
SUPABASE_URL=https://bpzqnooiisgadzicwupi.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwenFub29paXNnYWR6aWN3dXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1ODQ0NDcsImV4cCI6MjA4NzE2MDQ0N30.BDdYM-SQDCIVJJueUH8ed9-vHrY_g2sb8PDeD9vb_L4
DATABASE_URL=postgresql://postgres:Socrate2025_A@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require
```

## 🔧 Fonctionnalités activées avec Supabase

### Stockage des données
- **Conversations** : Toutes les discussions sont sauvegardées
- **Configurations** : Préférences utilisateur persistantes
- **Métriques** : Performance système en temps réel
- **Erreurs** : Logs pour le débogage

### Sécurité
- **RLS (Row Level Security)** : Chaque utilisateur ne voit que ses données
- **Anonymisation** : Données protégées et accessibles uniquement par l'application

### Analytics
- **Dashboard stats** : Statistiques d'utilisation
- **Usage tracking** : Comportement utilisateur
- **Performance monitoring** : Métriques techniques

## 🚀 Test de connexion

Démarrez l'application et vérifiez les logs :

```bash
npm start
```

Vous devriez voir :
- `✅ Connecté à Supabase - Base de données active` si tout fonctionne
- `⚠️ Mode fallback - Supabase non disponible` en cas de problème

## 📊 Visualisation des données

Dans Supabase Dashboard, vous pouvez :

1. **Table Editor** : Voir les données en temps réel
2. **SQL Editor** : Exécuter des requêtes personnalisées
3. **Logs** : Surveiller les appels API

### Requêtes utiles

```sql
-- Voir les conversations récentes
SELECT * FROM conversations ORDER BY created_at DESC LIMIT 10;

-- Statistiques d'utilisation
SELECT 
    COUNT(*) as total_conversations,
    COUNT(DISTINCT user_id) as unique_users,
    MAX(created_at) as last_activity
FROM conversations;

-- Métriques système des dernières 24h
SELECT * FROM system_metrics 
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

## 🔒 Gestion des accès

### Clés API configurées
- **Anon Key** : Pour les clients web (déjà configurée)
- **Service Role** : Pour les opérations admin (à garder secrète)

### Permissions RLS
- Les utilisateurs ne voient que leurs propres conversations
- Les métriques sont en lecture seule pour le public
- Les logs d'erreurs sont accessibles pour le débogage

## 🧹 Nettoyage automatique

Le système nettoie automatiquement les anciennes données :

```sql
-- Nettoyer les données de plus de 30 jours
SELECT cleanup_old_data(30);
```

Ou manuellement dans le SQL Editor.

## 📈 Monitoring

L'application sauvegarde automatiquement :
- **Métriques système** toutes les 5 minutes
- **Conversations** à chaque échange
- **Erreurs** lorsqu'elles se produisent
- **Sessions utilisateur** lors des connexions

## 🎯 Prochaines étapes

1. ✅ Configurer les tables SQL
2. ✅ Connecter l'application
3. 🔄 Tester les fonctionnalités
4. 📊 Explorer les données dans le dashboard
5. 🚀 Déployer en production

Votre DevOps Assistant Bot est maintenant connecté à Supabase ! 🎉
