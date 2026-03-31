# Guide Configuration Supabase

## 🎯 Objectif
Remplacer toutes les données factices par des vraies données stockées dans Supabase.

## ✅ Modifications apportées

### 1. Backend - Services Supabase
- **`src/supabase-config-service.js`** : Service dédié pour la configuration utilisateur
- **Routes API** : `/api/config/save`, `/api/config/load/:userId`, `/api/config/:userId`
- **Validation** : Validation côté serveur + stockage dans Supabase

### 2. Base de données
- **Table `user_configs`** mise à jour avec champs `api_key` et `provider`
- **Stockage sécurisé** : Clés API cryptées dans Supabase
- **RLS activé** : Chaque utilisateur ne voit que ses données

### 3. Frontend
- **Nouvelle page configuration** : `/configuration.html`
- **Génération ID utilisateur** : Champ pour ID unique
- **Sauvegarde Supabase** : Plus de localStorage, tout dans Supabase
- **Design amélioré** : Boutons visibles, feedback utilisateur

## 🚀 Utilisation

### 1. Créer les tables dans Supabase
```sql
-- Exécuter le contenu de database/schema.sql dans le SQL Editor Supabase
```

### 2. Configurer une clé API
1. Allez sur : http://localhost:3000/configuration.html
2. Choisissez votre provider (OpenAI/Gemini)
3. Entrez votre clé API
4. **Entrez un ID utilisateur unique** (ex: email, uuid, etc.)
5. Cliquez sur "Sauvegarder"

### 3. Vérifier dans Supabase
- Allez sur votre dashboard Supabase
- Table `user_configs`
- Vous devriez voir votre configuration stockée

## 📊 Fonctionnalités

### ✅ Sauvegarde dans Supabase
- Configuration utilisateur stockée dans `user_configs`
- Plus de données factices
- Persistance réelle des données

### ✅ Chargement depuis Supabase
- Chargement automatique de la configuration existante
- Masquage des clés API pour la sécurité
- Affichage du provider utilisé

### ✅ Validation robuste
- Validation côté client et serveur
- Messages d'erreur clairs
- Feedback visuel immédiat

### ✅ Multi-fournisseurs
- Support OpenAI et Gemini
- Validation spécifique par provider
- Fallback automatique

## 🔧 Routes API

### POST /api/config/save
```json
{
  "apiKey": "sk-xxxxx",
  "provider": "openai",
  "userId": "user123"
}
```

### GET /api/config/load/:userId
Retourne la configuration masquée de l'utilisateur

### DELETE /api/config/:userId
Supprime la configuration utilisateur

## 🎨 Design corrigé

- **Boutons visibles** : Sauvegarder et Effacer fonctionnels
- **Loading state** : Indicateur de chargement pendant la sauvegarde
- **Messages de validation** : Feedback immédiat
- **Responsive design** : Fonctionne sur mobile et desktop

## 🔄 Migration depuis localStorage

1. **Ancien système** : localStorage côté client
2. **Nouveau système** : Supabase côté serveur
3. **Bénéfices** :
   - Persistance réelle
   - Multi-appareils
   - Backup automatique
   - Sécurité améliorée

## 🎯 Prochaines étapes

1. **Tester** : Valider le fonctionnement complet
2. **Déployer** : Pousser en production
3. **Monitor** : Surveiller l'utilisation
4. **Optimiser** : Améliorer les performances

Votre application utilise maintenant **100% Supabase** pour stocker toutes les données ! 🗄️✨
