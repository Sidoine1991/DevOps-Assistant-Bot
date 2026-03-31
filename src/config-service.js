class ConfigService {
  constructor() {
    this.configKey = 'devops-assistant-config';
  }

  // Sauvegarder la configuration (côté client uniquement)
  saveConfig(apiKey, provider = 'openai') {
    // Cette méthode ne fonctionne que côté client
    // Côté serveur, on fait juste la validation
    return this.validateApiKey(apiKey, provider);
  }

  // Charger la configuration (côté client uniquement)
  loadConfig() {
    // Cette méthode ne fonctionne que côté client
    return null; // Côté serveur, on ne peut pas charger le localStorage
  }

  // Valider le format de la clé API
  validateApiKey(apiKey, provider) {
    if (provider === 'local-rag') {
      return true;
    }

    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    switch (provider) {
      case 'openai':
        // OpenAI: commence par "sk-" et fait au moins 20 caractères
        return apiKey.startsWith('sk-') && apiKey.length >= 20;
      case 'gemini':
        // Gemini: accepte plusieurs formats récents de clés Google
        return /^[A-Za-z0-9_-]{20,120}$/.test(apiKey);
      default:
        return false;
    }
  }

  // Supprimer la configuration
  clearConfig() {
    try {
      localStorage.removeItem(this.configKey);
      return true;
    } catch (error) {
      console.error('Erreur suppression config:', error);
      return false;
    }
  }

  // Vérifier si une configuration existe
  hasConfig() {
    return this.loadConfig() !== null;
  }

  // Obtenir la clé API masquée pour l'affichage
  getMaskedApiKey() {
    const config = this.loadConfig();
    if (!config || !config.apiKey) {
      return '';
    }
    
    const apiKey = config.apiKey;
    if (apiKey.length <= 8) {
      return '***';
    }
    
    return apiKey.substring(0, 8) + '***' + apiKey.substring(apiKey.length - 4);
  }
}

module.exports = ConfigService;
