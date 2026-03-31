const { createClient } = require('@supabase/supabase-js');

class SupabaseService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    if (!this.supabaseUrl || !this.supabaseKey) {
      console.warn('Variables Supabase manquantes. Utilisation du mode fallback.');
      this.client = null;
    } else {
      this.client = createClient(this.supabaseUrl, this.supabaseKey);
    }
  }

  // Vérifier la connexion à Supabase
  async isConnected() {
    if (!this.client) return false;
    
    try {
      const { data, error } = await this.client
        .from('conversations')
        .select('count')
        .limit(1);
      
      return !error;
    } catch (error) {
      console.error('Erreur connexion Supabase:', error);
      return false;
    }
  }

  // Sauvegarder une conversation
  async saveConversation(userId, message, botResponse, metadata = {}) {
    if (!this.client) {
      console.log('Mode fallback: conversation non sauvegardée');
      return null;
    }

    try {
      const { data, error } = await this.client
        .from('conversations')
        .insert([
          {
            user_id: userId,
            user_message: message,
            bot_response: botResponse,
            metadata: metadata,
            created_at: new Date().toISOString()
          }
        ])
        .select();

      if (error) throw error;
      return data[0];
    } catch (error) {
      if (error && error.code === '42501') {
        console.warn('RLS bloque l\'écriture dans conversations. Configurez une policy INSERT/SELECT sur la table conversations.');
        return null;
      }
      console.error('Erreur sauvegarde conversation:', error);
      return null;
    }
  }

  // Récupérer l'historique des conversations
  async getConversations(userId, limit = 50) {
    if (!this.client) return [];

    try {
      const { data, error } = await this.client
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur récupération conversations:', error);
      return [];
    }
  }

  // Sauvegarder la configuration utilisateur
  async saveUserConfig(userId, config) {
    if (!this.client) {
      console.log('Mode fallback: configuration non sauvegardée');
      return null;
    }

    try {
      const { data, error } = await this.client
        .from('user_configs')
        .upsert([
          {
            user_id: userId,
            config: config,
            updated_at: new Date().toISOString()
          }
        ])
        .select();

      if (error) throw error;
      return data[0];
    } catch (error) {
      console.error('Erreur sauvegarde config utilisateur:', error);
      return null;
    }
  }

  // Récupérer la configuration utilisateur
  async getUserConfig(userId) {
    if (!this.client) return null;

    try {
      const { data, error } = await this.client
        .from('user_configs')
        .select('config')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data ? data.config : null;
    } catch (error) {
      console.error('Erreur récupération config utilisateur:', error);
      return null;
    }
  }

  // Sauvegarder les métriques système
  async saveSystemMetrics(metrics) {
    if (!this.client) return null;

    try {
      const { data, error } = await this.client
        .from('system_metrics')
        .insert([
          {
            cpu_usage: metrics.cpu,
            memory_usage: metrics.memory,
            disk_usage: metrics.disk,
            active_users: metrics.activeUsers || 0,
            created_at: new Date().toISOString()
          }
        ])
        .select();

      if (error) throw error;
      return data[0];
    } catch (error) {
      console.error('Erreur sauvegarde métriques:', error);
      return null;
    }
  }

  // Récupérer les métriques récentes
  async getRecentMetrics(hours = 24) {
    if (!this.client) return [];

    try {
      const { data, error } = await this.client
        .from('system_metrics')
        .select('*')
        .gte('created_at', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Erreur récupération métriques:', error);
      return [];
    }
  }

  // Sauvegarder les logs d'erreurs
  async saveErrorLog(error, context = {}) {
    if (!this.client) return null;

    try {
      const { data, error: insertError } = await this.client
        .from('error_logs')
        .insert([
          {
            error_message: error.message,
            error_stack: error.stack,
            context: context,
            created_at: new Date().toISOString()
          }
        ])
        .select();

      if (insertError) throw insertError;
      return data[0];
    } catch (err) {
      console.error('Erreur sauvegarde log erreur:', err);
      return null;
    }
  }

  // Nettoyer les anciennes données
  async cleanupOldData(daysToKeep = 30) {
    if (!this.client) return;

    try {
      const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

      // Nettoyer les anciennes conversations
      await this.client
        .from('conversations')
        .delete()
        .lt('created_at', cutoffDate);

      // Nettoyer les anciennes métriques
      await this.client
        .from('system_metrics')
        .delete()
        .lt('created_at', cutoffDate);

      // Nettoyer les anciens logs d'erreurs
      await this.client
        .from('error_logs')
        .delete()
        .lt('created_at', cutoffDate);

      console.log('Nettoyage des anciennes données terminé');
    } catch (error) {
      console.error('Erreur nettoyage données:', error);
    }
  }

  // Statistiques du tableau de bord
  async getDashboardStats() {
    if (!this.client) return null;

    try {
      const [conversationsResult, metricsResult, errorsResult] = await Promise.all([
        this.client.from('conversations').select('count', { count: 'exact' }),
        this.client.from('system_metrics').select('cpu_usage, memory_usage, disk_usage').order('created_at', { ascending: false }).limit(1),
        this.client.from('error_logs').select('count', { count: 'exact' }).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      ]);

      return {
        totalConversations: conversationsResult.count || 0,
        latestMetrics: metricsResult.data[0] || null,
        recentErrors: errorsResult.count || 0
      };
    } catch (error) {
      console.error('Erreur récupération stats dashboard:', error);
      return null;
    }
  }
}

module.exports = SupabaseService;
