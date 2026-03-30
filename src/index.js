const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

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

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/bot/status', (req, res) => {
  res.json({ 
    bot: 'online', 
    version: '1.0.0',
    services: {
      'command-engine': 'active',
      'monitor': 'active',
      'notification': 'active'
    }
  });
});

// WebSocket pour le chatbot
io.on('connection', (socket) => {
  console.log('Client connecté:', socket.id);
  
  socket.on('message', async (data) => {
    const { message, userId } = data;
    console.log(`Message reçu de ${userId}: ${message}`);
    
    // Traitement basique du message
    let response = '';
    
    if (message.toLowerCase().includes('déploye')) {
      response = 'Je vais vous aider avec le déploiement. Quel service souhaitez-vous déployer ?';
    } else if (message.toLowerCase().includes('monitor')) {
      response = 'Voici l\'état actuel du système: CPU: 45%, Mémoire: 62%, Disque: 78%';
    } else if (message.toLowerCase().includes('erreur')) {
      response = 'Je détecte 3 erreurs critiques dans les logs. Voulez-vous que je les analyse ?';
    } else {
      response = 'Je suis votre assistant DevOps. Je peux vous aider avec les déploiements, le monitoring et la gestion des erreurs.';
    }
    
    socket.emit('response', { 
      message: response,
      timestamp: new Date().toISOString(),
      bot: 'DevOps Assistant'
    });
  });
  
  socket.on('disconnect', () => {
    console.log('Client déconnecté:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur DevOps Assistant Bot démarré sur le port ${PORT}`);
});
