const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();
const AIService = require('./ai-service');
const ConfigService = require('./config-service');
const SupabaseService = require('./supabase-service');
const SupabaseConfigService = require('./supabase-config-service');
const KnowledgeService = require('./knowledge-service');
const UserKnowledgeService = require('./user-knowledge-service');
const AuthService = require('./auth-service');

const app = express();
const server = http.createServer(app);

const originsRaw = process.env.FRONTEND_ORIGINS;
const corsOrigins = originsRaw
  ? originsRaw.split(',').map((s) => s.trim()).filter(Boolean)
  : null;
const corsOptions = {
  origin: corsOrigins && corsOrigins.length ? corsOrigins : true,
  credentials: true,
};

const io = socketIo(server, {
  cors: {
    origin: corsOrigins && corsOrigins.length ? corsOrigins : true,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Servir les fichiers statiques
app.use(express.static('public'));
app.use('/media', express.static(path.join(__dirname, '../media')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Initialiser les services
const aiService = new AIService();
const supabaseService = new SupabaseService();
const supabaseConfigService = new SupabaseConfigService();
const knowledgeService = new KnowledgeService();
const userKnowledgeService = new UserKnowledgeService(supabaseService);
const authService = new AuthService(supabaseService);
const connectedUserIds = new Set();
const socketUserMap = new Map();

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/bot/status', async (req, res) => {
  const dbConnected = await supabaseService.isConnected();
  const configConnected = await supabaseConfigService.isConnected();
  const stats = await supabaseService.getDashboardStats();
  
  res.json({ 
    bot: 'online', 
    version: '1.0.0',
    hasAIConfig: !!(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY),
    database: {
      connected: dbConnected,
      type: 'Supabase',
      stats: stats,
      configStore: {
        connected: configConnected.success,
        code: configConnected.code
      }
    },
    services: {
      'command-engine': 'active',
      'monitor': 'active',
      'notification': 'active',
      'database': dbConnected ? 'active' : 'inactive'
    },
    connectedUsers: {
      sockets: io.engine.clientsCount,
      authenticated: connectedUserIds.size
    },
    rag: {
      enabled: !!(aiService.retrievalService && aiService.retrievalService.enabled),
      collection: process.env.RAG_COLLECTION || 'devops_courses',
      chromaUrlConfigured: !!(process.env.CHROMA_URL && String(process.env.CHROMA_URL).trim()),
    },
  });
});

app.get('/api/users/connected', (req, res) => {
  return res.status(200).json({
    success: true,
    sockets: io.engine.clientsCount,
    authenticatedUsers: connectedUserIds.size,
  });
});

app.post('/api/auth/request-code', async (req, res) => {
  try {
    const { email, fullName } = req.body || {};
    const result = await authService.requestVerificationCode(email, fullName);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: error.message,
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body || {};
    const result = await authService.registerWithPassword(email, password, fullName);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const result = await authService.loginWithPassword(email, password);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error.message });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    const result = await authService.requestPasswordReset(email);
    const status = result.success ? 200 : result.code === 'CODE_SAVE_FAILED' ? 503 : 400;
    return res.status(status).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error.message });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body || {};
    const result = await authService.resetPasswordWithCode(email, code, newPassword);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error.message });
  }
});

app.get('/api/auth/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await supabaseService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' });
    }
    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name || '',
        isVerified: user.is_verified
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error.message });
  }
});

app.post('/api/auth/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const result = await authService.verifyCode(email, code);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: error.message,
    });
  }
});

app.get('/api/knowledge/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'userId requis' });
    }
    const chunks = await supabaseService.getUserKnowledgeChunks(userId, 5000);
    const sources = new Set(chunks.map((chunk) => chunk.source_name));
    return res.status(200).json({
      success: true,
      userId,
      chunks: chunks.length,
      documents: sources.size,
      sourceNames: [...sources],
    });
  } catch (error) {
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error.message });
  }
});

app.get('/api/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(Number(req.query.limit || 100), 300);
    if (!userId) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'userId requis' });
    }
    const conversations = await supabaseService.getConversations(userId, limit);
    return res.status(200).json({
      success: true,
      userId,
      count: conversations.length,
      conversations,
    });
  } catch (error) {
    return res.status(500).json({ success: false, code: 'SERVER_ERROR', message: error.message });
  }
});

// Route pour valider les clés API
app.post('/api/config/validate', (req, res) => {
  const { apiKey, provider } = req.body;
  console.log('Validation request:', { apiKey: apiKey ? '***' + apiKey.slice(-4) : 'null', provider });
  
  const configService = new ConfigService();
  const isValid = configService.validateApiKey(apiKey, provider);
  console.log('Validation result:', { isValid, keyLength: apiKey ? apiKey.length : 'null' });
  
  return res.status(200).json({
    isValid,
    code: isValid ? 'VALID' : 'INVALID_FORMAT',
    message: isValid ? 'Clé API valide' : 'Format de clé API invalide'
  });
});

// Routes pour la configuration avec Supabase
app.post('/api/config/save', async (req, res) => {
  try {
    const { apiKey, provider, userId } = req.body;
    console.log('Save request:', { apiKey: apiKey ? '***' + apiKey.slice(-4) : 'null', provider, userId });

    // Validation
    if (!provider || !userId || (provider !== 'local-rag' && !apiKey)) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Fournisseur et ID utilisateur requis. Clé API requise sauf en mode local-rag.'
      });
    }

    // Vérifier la connexion à Supabase avant de continuer
    const supabaseHealth = await supabaseConfigService.isConnected();
    if (!supabaseHealth.success) {
      console.warn('SupabaseConfigService non connecté:', supabaseHealth);
      return res.status(503).json({
        success: false,
        code: supabaseHealth.code,
        message: supabaseHealth.message
      });
    }

    // Validation de format
    const isValid = supabaseConfigService.validateApiKey(apiKey || '', provider);
    
    if (!isValid) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_API_KEY_FORMAT',
        message: 'Format de clé API invalide'
      });
    }
    
    // Sauvegarder dans Supabase
    const saved = await supabaseConfigService.saveUserConfig(userId, apiKey || '', provider);
    
    if (saved.success) {
      return res.status(200).json({
        success: true,
        code: saved.code,
        message: saved.message
      });
    }
    console.warn('Échec save config:', saved);
    return res.status(500).json(saved);
  } catch (error) {
    console.error('Erreur sauvegarde config:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Erreur serveur: ' + error.message
    });
  }
});

// Route pour charger la configuration depuis Supabase
app.get('/api/config/load/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'ID utilisateur requis'
      });
    }

    const supabaseHealth = await supabaseConfigService.isConnected();
    if (!supabaseHealth.success) {
      return res.status(503).json({
        success: false,
        code: supabaseHealth.code,
        message: supabaseHealth.message
      });
    }

    const configResult = await supabaseConfigService.getUserConfig(userId);
    
    if (configResult.success && configResult.data) {
      const config = configResult.data;
      // Masquer la clé API pour la réponse
      const maskedConfig = {
        ...config,
        apiKey: config.apiKey && config.apiKey.length > 12
          ? config.apiKey.substring(0, 8) + '***' + config.apiKey.substring(config.apiKey.length - 4)
          : (config.provider === 'local-rag' ? 'Aucune clé API (mode local-rag)' : 'Clé API masquée')
      };
      
      return res.status(200).json({
        success: true,
        code: configResult.code,
        config: maskedConfig
      });
    }
    return res.status(configResult.code === 'CONFIG_NOT_FOUND' ? 404 : 500).json(configResult);
  } catch (error) {
    console.error('Erreur chargement config:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: 'Erreur serveur: ' + error.message
    });
  }
});

// Route pour supprimer la configuration
app.delete('/api/config/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'ID utilisateur requis'
      });
    }

    const supabaseHealth = await supabaseConfigService.isConnected();
    if (!supabaseHealth.success) {
      return res.status(503).json({
        success: false,
        code: supabaseHealth.code,
        message: supabaseHealth.message
      });
    }

    const deleted = await supabaseConfigService.deleteUserConfig(userId);
    
    if (deleted.success) {
      return res.status(200).json(deleted);
    }
    return res.status(500).json(deleted);
  } catch (error) {
    console.error('Erreur suppression config:', error);
    return res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
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
      const user = await supabaseService.getUserById(userId);
      if (!user) {
        socket.emit('response', {
          message: 'Votre session est invalide. Connectez-vous de nouveau.',
          timestamp: new Date().toISOString(),
          bot: 'DevOps Assistant Auth',
          sources: []
        });
        return;
      }

      connectedUserIds.add(userId);
      socketUserMap.set(socket.id, userId);

      // Charger la configuration utilisateur depuis Supabase (clé non masquée côté serveur)
      let userConfig = null;
      let apiKey = '';
      let provider = '';

      const serverSideConfig = await supabaseConfigService.getUserConfig(userId);
      if (serverSideConfig.success && serverSideConfig.data && serverSideConfig.data.apiKey) {
        userConfig = serverSideConfig.data;
        apiKey = serverSideConfig.data.apiKey;
        provider = serverSideConfig.data.provider || 'openai';
      } else if (serverSideConfig.success && serverSideConfig.data && serverSideConfig.data.provider === 'local-rag') {
        userConfig = serverSideConfig.data;
        provider = 'local-rag';
      } else if (data.userConfigLocal && (data.userConfigLocal.apiKey || data.userConfigLocal.provider === 'local-rag')) {
        // Fallback local: utilisé uniquement si Supabase n'a pas de config.
        userConfig = data.userConfigLocal;
        apiKey = data.userConfigLocal.apiKey || '';
        provider = data.userConfigLocal.provider || '';
      }

      // Sélection automatique par défaut:
      // - si RAG connecté: mode local-rag (offline/doc)
      // - sinon: provider cloud disponible (Gemini puis OpenAI)
      if (!provider) {
        if (aiService.retrievalService && aiService.retrievalService.enabled) {
          provider = 'local-rag';
        } else if (process.env.GEMINI_API_KEY) {
          provider = 'gemini';
          apiKey = process.env.GEMINI_API_KEY;
        } else if (process.env.OPENAI_API_KEY) {
          provider = 'openai';
          apiKey = process.env.OPENAI_API_KEY;
        } else {
          provider = 'local-rag';
        }
      }

      const knowledgeContext = await knowledgeService.getGroundingContext(message);
      const attachments = Array.isArray(data.attachments) ? data.attachments : [];

      // Ingestion automatique des documents utilisateur (chunking + stockage Supabase).
      const ingestion = await userKnowledgeService.ingestAttachments(userId, attachments);
      if (ingestion.ingestedFiles > 0) {
        console.log(`Knowledge ingest: ${ingestion.ingestedFiles} fichier(s), ${ingestion.ingestedChunks} chunk(s), user=${userId}`);
      }
      const userKnowledgeContext = await userKnowledgeService.getContextForQuery(userId, message, 8);

      if (apiKey && provider !== 'local-rag') {
        if (provider === 'openai') {
          process.env.OPENAI_API_KEY = apiKey;
        } else if (provider === 'gemini') {
          process.env.GEMINI_API_KEY = apiKey;
        }
        aiService.initializeProviders();
      }

      // Mode local-rag : clé optionnelle en base = secours cloud si Chroma ou corpus vide.
      if (provider === 'local-rag' && userConfig && userConfig.apiKey && String(userConfig.apiKey).trim()) {
        const k = String(userConfig.apiKey).trim();
        if (k.startsWith('sk-')) {
          process.env.OPENAI_API_KEY = k;
        } else {
          process.env.GEMINI_API_KEY = k;
        }
        aiService.initializeProviders();
      }

      if (provider === 'local-rag') {
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
        provider: provider,
        preferLocalRag: provider === 'local-rag',
        attachments,
        knowledgeContext,
        userKnowledgeContext
      });
      
      // Sauvegarder la conversation dans Supabase
      await supabaseService.saveConversation(userId, message, response, {
        provider: provider,
        hasCustomKey: !!userConfig,
        attachmentsCount: attachments.length,
        ingestedFiles: ingestion.ingestedFiles,
        ingestedChunks: ingestion.ingestedChunks,
        userAgent: data.userAgent,
        timestamp: new Date().toISOString()
      });

      const combinedSources = [
        ...(Array.isArray(knowledgeContext.sources) ? knowledgeContext.sources : []),
        ...(Array.isArray(userKnowledgeContext.sources) ? userKnowledgeContext.sources : []),
      ];
      
      socket.emit('response', { 
        message: response,
        timestamp: new Date().toISOString(),
        bot: `DevOps Assistant AI (${provider.toUpperCase()})`,
        sources: combinedSources
      });
      
      console.log(`Provider ${provider} utilisé pour l'utilisateur ${userId}`);
      
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
    const userId = socketUserMap.get(socket.id);
    if (userId) {
      connectedUserIds.delete(userId);
      socketUserMap.delete(socket.id);
    }
    console.log('Client déconnecté:', socket.id);
  });
});

function startServer() {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, async () => {
    console.log(`Serveur DevOps Assistant Bot démarré sur le port ${PORT}`);
    
    const isConnected = await supabaseService.isConnected();
    if (isConnected) {
      console.log('✅ Connecté à Supabase - Base de données active');
    } else {
      console.log('⚠️ Mode fallback - Supabase non disponible');
    }
    
    setInterval(async () => {
      const metrics = {
        cpu: Math.floor(Math.random() * 30) + 30,
        memory: Math.floor(Math.random() * 20) + 50,
        disk: Math.floor(Math.random() * 10) + 70,
        activeUsers: io.engine.clientsCount
      };
      await supabaseService.saveSystemMetrics(metrics);
    }, 5 * 60 * 1000);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
