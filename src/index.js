const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();
const AIService = require('./ai-service');
const ConfigService = require('./config-service');
const SupabaseService = require('./supabase-service');
const SupabaseConfigService = require('./supabase-config-service');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Servir les fichiers statiques
app.use(express.static('public'));

// Initialiser les services
const aiService = new AIService();
const supabaseService = new SupabaseService();
const supabaseConfigService = new SupabaseConfigService();

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/bot/status', async (req, res) => {
  const isConnected = await supabaseService.isConnected();
  const stats = await supabaseService.getDashboardStats();
  
  res.json({ 
    bot: 'online', 
    version: '1.0.0',
    hasAIConfig: process.env.OPENAI_API_KEY ? true : false,
    database: {
      connected: isConnected,
      type: 'Supabase',
      stats: stats
    },
    services: {
      'command-engine': 'active',
      'monitor': 'active',
      'notification': 'active',
      'database': isConnected ? 'active' : 'inactive'
    }
  });
});

// Route pour valider les clés API
app.post('/api/config/validate', (req, res) => {
  const { apiKey, provider } = req.body;
  console.log('Validation request:', { apiKey: apiKey ? '***' + apiKey.slice(-4) : 'null', provider });
  
  const configService = new ConfigService();
  const isValid = configService.validateApiKey(apiKey, provider);
  console.log('Validation result:', { isValid, keyLength: apiKey ? apiKey.length : 'null' });
  
  res.json({ 
    isValid,
    message: isValid ? 'Clé API valide' : 'Format de clé API invalide'
  });
});

// Routes pour la configuration avec Supabase
app.post('/api/config/save', async (req, res) => {
  try {
    const { apiKey, provider, userId } = req.body;
    console.log('Save request:', { apiKey: apiKey ? '***' + apiKey.slice(-4) : 'null', provider, userId });

    // Validation
    if (!apiKey || !provider || !userId) {
      return res.json({ 
        success: false,
        message: 'Clé API, fournisseur et ID utilisateur requis'
      });
    }

    // Vérifier la connexion à Supabase avant de continuer
    const supabaseReady = await supabaseConfigService.isConnected();
    if (!supabaseReady) {
      console.warn('SupabaseConfigService non connecté : vérifiez SUPABASE_URL, SUPABASE_ANON_KEY et la table user_configs');
      return res.json({
        success: false,
        code: 'SUPABASE_NOT_READY',
        message: 'Le stockage Supabase n’est pas configuré côté serveur. Vérifiez SUPABASE_URL, SUPABASE_ANON_KEY et la table user_configs.'
      });
    }

    // Validation de format
    const isValid = supabaseConfigService.validateApiKey(apiKey, provider);
    
    if (!isValid) {
      return res.json({ 
        success: false,
        message: 'Format de clé API invalide'
      });
    }
    
    // Sauvegarder dans Supabase
    const saved = await supabaseConfigService.saveUserConfig(userId, apiKey, provider);
    
    if (saved) {
      res.json({ 
        success: true,
        message: 'Configuration sauvegardée avec succès dans Supabase'
      });
    } else {
      res.json({ 
        success: false,
        code: 'SUPABASE_SAVE_FAILED',
        message: 'Erreur lors de la sauvegarde dans Supabase'
      });
    }
  } catch (error) {
    console.error('Erreur sauvegarde config:', error);
    res.json({ 
      success: false,
      message: 'Erreur serveur: ' + error.message
    });
  }
});

// Route pour charger la configuration depuis Supabase
app.get('/api/config/load/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.json({ 
        success: false,
        message: 'ID utilisateur requis'
      });
    }

    const supabaseReady = await supabaseConfigService.isConnected();
    if (!supabaseReady) {
      return res.json({
        success: false,
        code: 'SUPABASE_NOT_READY',
        message: 'Le stockage Supabase n’est pas disponible actuellement.'
      });
    }

    const config = await supabaseConfigService.getUserConfig(userId);
    
    if (config) {
      // Masquer la clé API pour la réponse
      const maskedConfig = {
        ...config,
        apiKey: config.apiKey.substring(0, 8) + '***' + config.apiKey.substring(config.apiKey.length - 4)
      };
      
      res.json({ 
        success: true,
        config: maskedConfig
      });
    } else {
      res.json({ 
        success: false,
        message: 'Aucune configuration trouvée'
      });
    }
  } catch (error) {
    console.error('Erreur chargement config:', error);
    res.json({ 
      success: false,
      message: 'Erreur serveur: ' + error.message
    });
  }
});

// Route pour supprimer la configuration
app.delete('/api/config/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.json({ 
        success: false,
        message: 'ID utilisateur requis'
      });
    }

    const supabaseReady = await supabaseConfigService.isConnected();
    if (!supabaseReady) {
      return res.json({
        success: false,
        code: 'SUPABASE_NOT_READY',
        message: 'Le stockage Supabase n’est pas disponible actuellement.'
      });
    }

    const deleted = await supabaseConfigService.deleteUserConfig(userId);
    
    res.json({ 
      success: deleted,
      message: deleted ? 'Configuration supprimée avec succès' : 'Erreur lors de la suppression'
    });
  } catch (error) {
    console.error('Erreur suppression config:', error);
    res.json({ 
      success: false,
      message: 'Erreur serveur: ' + error.message
    });
  }
});

// WebSocket pour le chatbot
io.on('connection', (socket) => {
  console.log('Client connecté:', socket.id);
  
  socket.on('message', async (data) => {
    const { message, userId } = data;
    console.log(`Message reçu de ${userId}: ${message}`);
    
    try {
      // Charger la configuration utilisateur depuis Supabase (clé non masquée côté serveur)
      let userConfig = null;
      let apiKey = process.env.OPENAI_API_KEY;
      let provider = 'openai';

      const serverSideConfig = await supabaseConfigService.getUserConfig(userId);
      if (serverSideConfig && serverSideConfig.apiKey) {
        userConfig = serverSideConfig;
        apiKey = serverSideConfig.apiKey;
        provider = serverSideConfig.provider || 'openai';
      } else if (data.userConfigLocal && data.userConfigLocal.apiKey) {
        // Fallback local: utilisé uniquement si Supabase n'a pas de config.
        userConfig = data.userConfigLocal;
        apiKey = data.userConfigLocal.apiKey;
        provider = data.userConfigLocal.provider || 'openai';
      }

      if (userConfig && apiKey) {
        if (provider === 'openai') {
          process.env.OPENAI_API_KEY = apiKey;
        } else if (provider === 'gemini') {
          process.env.GEMINI_API_KEY = apiKey;
        }
        aiService.initializeProviders();
      }
      
      // Utiliser l'IA pour générer une réponse intelligente
      const response = await aiService.getDevOpsResponse(message, {
        userId,
        timestamp: new Date().toISOString(),
        services: {
          'command-engine': 'active',
          'monitor': 'active',
          'notification': 'active'
        },
        hasCustomKey: !!userConfig,
        provider: provider
      });
      
      // Sauvegarder la conversation dans Supabase
      await supabaseService.saveConversation(userId, message, response, {
        provider: provider,
        hasCustomKey: !!userConfig,
        userAgent: data.userAgent,
        timestamp: new Date().toISOString()
      });
      
      socket.emit('response', { 
        message: response,
        timestamp: new Date().toISOString(),
        bot: userConfig ? `DevOps Assistant AI (${provider.toUpperCase()})` : 'DevOps Assistant AI'
      });
      
      if (userConfig) {
        console.log(`Provider ${provider} configuré pour l'utilisateur ${userId}`);
      }
      
    } catch (error) {
      console.error('Erreur lors du traitement du message:', error);
      
      // Sauvegarder l'erreur dans Supabase
      await supabaseService.saveErrorLog(error, {
        userId,
        message,
        timestamp: new Date().toISOString()
      });
      
      // Réponse de secours en cas d'erreur
      const fallbackResponse = 'Désolé, je rencontre une difficulté technique. Je peux quand même vous aider avec les déploiements, monitoring et optimisation. Quel sujet vous intéresse ?';
      
      socket.emit('response', { 
        message: fallbackResponse,
        timestamp: new Date().toISOString(),
        bot: 'DevOps Assistant'
      });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client déconnecté:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`Serveur DevOps Assistant Bot démarré sur le port ${PORT}`);
  
  // Vérifier la connexion à Supabase
  const isConnected = await supabaseService.isConnected();
  if (isConnected) {
    console.log('✅ Connecté à Supabase - Base de données active');
  } else {
    console.log('⚠️ Mode fallback - Supabase non disponible');
  }
  
  // Sauvegarder les métriques système toutes les 5 minutes
  setInterval(async () => {
    const metrics = {
      cpu: Math.floor(Math.random() * 30) + 30,
      memory: Math.floor(Math.random() * 20) + 50,
      disk: Math.floor(Math.random() * 10) + 70,
      activeUsers: io.engine.clientsCount
    };
    
    await supabaseService.saveSystemMetrics(metrics);
  }, 5 * 60 * 1000); // 5 minutes
});
