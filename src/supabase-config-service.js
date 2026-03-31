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

  // Vérifier la connexion
  async isConnected() {
    if (!this.client) return false;
    
    try {
      const { data, error } = await this.client
        .from('user_configs')
        .select('count')
        .limit(1);
      
      return !error;
    } catch (error) {
      console.error('Erreur connexion Supabase Config:', error);
      return false;
    }
  }

  // Sauvegarder la configuration utilisateur dans Supabase
  async saveUserConfig(userId, apiKey, provider) {
    if (!this.client) {
      console.log('Mode fallback: configuration non sauvegardée dans Supabase');
      return null;
    }

    try {
      const config = {
        user_id: userId,
        api_key: apiKey,
        provider: provider,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.client
        .from('user_configs')
        .upsert([config])
        .select();

      if (error) throw error;
      return data[0];
    } catch (error) {
      console.error('Erreur sauvegarde config Supabase:', error);
      return null;
    }
  }

  // Récupérer la configuration utilisateur depuis Supabase
  async getUserConfig(userId) {
    if (!this.client) return null;

    try {
      const { data, error } = await this.client
        .from('user_configs')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        return {
          apiKey: data.api_key,
          provider: data.provider,
          timestamp: data.updated_at
        };
      }
      
      return null;
    } catch (error) {
      console.error('Erreur récupération config Supabase:', error);
      return null;
    }
  }

  // Supprimer la configuration utilisateur
  async deleteUserConfig(userId) {
    if (!this.client) return false;

    try {
      const { error } = await this.client
        .from('user_configs')
        .delete()
        .eq('user_id', userId);

      return !error;
    } catch (error) {
      console.error('Erreur suppression config Supabase:', error);
      return false;
    }
  }

  // Valider la clé API (réutilise la même logique)
  validateApiKey(apiKey, provider) {
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
