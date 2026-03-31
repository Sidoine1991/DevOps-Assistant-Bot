const { createClient } = require('@supabase/supabase-js');

class SupabaseConfigService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    if (!this.supabaseUrl || !this.supabaseKey) {
      console.warn('Variables Supabase manquantes pour le service de configuration');
      this.client = null;
    } else {
      this.client = createClient(this.supabaseUrl, this.supabaseKey);
    }
  }

  createResult(success, code, message, data = null) {
    return { success, code, message, data };
  }

  mapSupabaseError(error, fallbackCode = 'SUPABASE_ERROR', fallbackMessage = 'Erreur Supabase') {
    if (!error) {
      return this.createResult(false, fallbackCode, fallbackMessage);
    }

    const code = error.code || fallbackCode;
    const message = error.message || fallbackMessage;

    if (code === '42P01') {
      return this.createResult(false, 'SUPABASE_TABLE_MISSING', 'La table user_configs est introuvable.');
    }
    if (code === '42501') {
      return this.createResult(false, 'SUPABASE_POLICY_DENIED', 'Accès refusé par les policies RLS sur user_configs.');
    }
    if (code === 'PGRST116') {
      return this.createResult(false, 'CONFIG_NOT_FOUND', 'Aucune configuration trouvée pour cet utilisateur.');
    }
    if (code === 'PGRST204') {
      return this.createResult(
        false,
        'SUPABASE_SCHEMA_MISMATCH',
        "Schéma Supabase incompatible: vérifiez les colonnes attendues (user_id, api_key, provider, updated_at)."
      );
    }

    return this.createResult(false, code, message);
  }

  // Vérifier la connexion
  async isConnected() {
    if (!this.client) {
      return this.createResult(
        false,
        'SUPABASE_NOT_CONFIGURED',
        'SUPABASE_URL ou SUPABASE_ANON_KEY manquant côté serveur.'
      );
    }

    try {
      const { error } = await this.client
        .from('user_configs')
        .select('user_id')
        .limit(1);

      if (error) {
        return this.mapSupabaseError(error, 'SUPABASE_CONNECT_FAILED', 'Connexion Supabase impossible.');
      }

      return this.createResult(true, 'CONNECTED', 'Connexion Supabase active.');
    } catch (error) {
      console.error('Erreur connexion Supabase Config:', error);
      return this.createResult(false, 'SUPABASE_CONNECT_EXCEPTION', error.message);
    }
  }

  // Sauvegarder la configuration utilisateur dans Supabase
  async saveUserConfig(userId, apiKey, provider) {
    if (!this.client) {
      return this.createResult(
        false,
        'SUPABASE_NOT_CONFIGURED',
        'Supabase non configuré côté serveur.'
      );
    }

    try {
      const config = provider === 'local-rag'
        ? {
            user_id: userId,
            provider: provider,
            updated_at: new Date().toISOString()
          }
        : {
            user_id: userId,
            api_key: apiKey,
            provider: provider,
            updated_at: new Date().toISOString()
          };

      const { data, error } = await this.client
        .from('user_configs')
        .upsert([config])
        .select();

      if (error) {
        return this.mapSupabaseError(error, 'SUPABASE_SAVE_FAILED', 'Échec de sauvegarde dans user_configs.');
      }
      return this.createResult(true, 'CONFIG_SAVED', 'Configuration sauvegardée.', data[0]);
    } catch (error) {
      console.error('Erreur sauvegarde config Supabase:', error);
      return this.createResult(false, 'SUPABASE_SAVE_EXCEPTION', error.message);
    }
  }

  // Récupérer la configuration utilisateur depuis Supabase
  async getUserConfig(userId) {
    if (!this.client) {
      return this.createResult(false, 'SUPABASE_NOT_CONFIGURED', 'Supabase non configuré côté serveur.');
    }

    try {
      const { data, error } = await this.client
        .from('user_configs')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        return this.mapSupabaseError(error, 'SUPABASE_LOAD_FAILED', 'Échec du chargement de la configuration.');
      }

      if (data) {
        return this.createResult(true, 'CONFIG_FOUND', 'Configuration chargée.', {
          apiKey: data.api_key || '',
          provider: data.provider || 'openai',
          timestamp: data.updated_at
        });
      }

      return this.createResult(false, 'CONFIG_NOT_FOUND', 'Aucune configuration trouvée pour cet utilisateur.');
    } catch (error) {
      console.error('Erreur récupération config Supabase:', error);
      return this.createResult(false, 'SUPABASE_LOAD_EXCEPTION', error.message);
    }
  }

  // Supprimer la configuration utilisateur
  async deleteUserConfig(userId) {
    if (!this.client) {
      return this.createResult(false, 'SUPABASE_NOT_CONFIGURED', 'Supabase non configuré côté serveur.');
    }

    try {
      const { error } = await this.client
        .from('user_configs')
        .delete()
        .eq('user_id', userId);

      if (error) {
        return this.mapSupabaseError(error, 'SUPABASE_DELETE_FAILED', 'Échec de suppression de la configuration.');
      }
      return this.createResult(true, 'CONFIG_DELETED', 'Configuration supprimée.');
    } catch (error) {
      console.error('Erreur suppression config Supabase:', error);
      return this.createResult(false, 'SUPABASE_DELETE_EXCEPTION', error.message);
    }
  }

  // Valider la clé API (réutilise la même logique)
  validateApiKey(apiKey, provider) {
    if (provider === 'local-rag') {
      return true;
    }

    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    switch (provider) {
      case 'openai':
        return apiKey.startsWith('sk-') && apiKey.length >= 20;
      case 'gemini':
        return /^[A-Za-z0-9_-]{20,120}$/.test(apiKey);
      default:
        return false;
    }
  }
}

module.exports = SupabaseConfigService;
