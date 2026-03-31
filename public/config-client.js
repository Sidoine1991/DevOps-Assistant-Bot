class ClientConfigService {
  constructor() {
    this.configKey = 'devops-assistant-config';
    this.dbName = 'devops-assistant-db';
    this.storeName = 'settings';
  }

  async openDb() {
    if (!window.indexedDB) return null;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async setIndexedValue(key, value) {
    const db = await this.openDb();
    if (!db) return false;

    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    });
  }

  async getIndexedValue(key) {
    const db = await this.openDb();
    if (!db) return null;

    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const request = tx.objectStore(this.storeName).get(key);
      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  }

  async deleteIndexedValue(key) {
    const db = await this.openDb();
    if (!db) return false;

    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    });
  }

  // Sauvegarder la configuration dans IndexedDB, fallback localStorage
  async saveConfig(apiKey, provider = 'openai') {
    try {
      const config = {
        apiKey: apiKey,
        provider: provider,
        timestamp: new Date().toISOString(),
        isValid: this.validateApiKey(apiKey, provider)
      };

      const indexedSaved = await this.setIndexedValue(this.configKey, config);
      if (indexedSaved) return true;

      localStorage.setItem(this.configKey, JSON.stringify(config)); // fallback
      return true;
    } catch (error) {
      console.error('Erreur sauvegarde config:', error);
      return false;
    }
  }

  // Charger la configuration depuis IndexedDB, fallback localStorage
  async loadConfig() {
    try {
      const indexedConfig = await this.getIndexedValue(this.configKey);
      if (indexedConfig) return indexedConfig;

      const saved = localStorage.getItem(this.configKey);
      if (saved) {
        return JSON.parse(saved);
      }
      return null;
    } catch (error) {
      console.error('Erreur chargement config:', error);
      return null;
    }
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
  async clearConfig() {
    try {
      const indexedCleared = await this.deleteIndexedValue(this.configKey);
      localStorage.removeItem(this.configKey);
      return indexedCleared || true;
    } catch (error) {
      console.error('Erreur suppression config:', error);
      return false;
    }
  }

  // Vérifier si une configuration existe
  async hasConfig() {
    return (await this.loadConfig()) !== null;
  }

  // Obtenir la clé API masquée pour l'affichage
  async getMaskedApiKey() {
    const config = await this.loadConfig();
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

// Exporter pour utilisation dans le navigateur
if (typeof window !== 'undefined') {
  window.ClientConfigService = ClientConfigService;
}
