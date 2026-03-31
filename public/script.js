// Connexion WebSocket au serveur
const socket = io();
let startTime = Date.now();
let userId = localStorage.getItem('devops-user-id') || 'user-' + Math.random().toString(36).substr(2, 9);

// Sauvegarder l'ID utilisateur pour la session
localStorage.setItem('devops-user-id', userId);

// Éléments DOM
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const uptimeElement = document.getElementById('uptime');
const clientConfigService = typeof ClientConfigService !== 'undefined' ? new ClientConfigService() : null;

// Charger la configuration utilisateur depuis Supabase
async function loadUserConfig() {
    try {
        const response = await fetch(`/api/config/load/${userId}`);
        const result = await response.json();
        
        if (result.success && result.config) {
            return { ...result.config, source: 'supabase' };
        }
        
        // Fallback local si Supabase est indisponible
        if (clientConfigService && await clientConfigService.hasConfig()) {
            const localConfig = await clientConfigService.loadConfig();
            if (localConfig) {
                return { ...localConfig, source: 'local' };
            }
        }
        return null;
    } catch (error) {
        console.error('Erreur chargement config:', error);
        if (clientConfigService && await clientConfigService.hasConfig()) {
            const localConfig = await clientConfigService.loadConfig();
            if (localConfig) {
                return { ...localConfig, source: 'local' };
            }
        }
        return null;
    }
}

// Charger l'historique des conversations depuis Supabase
async function loadConversationHistory() {
    try {
        // Pour l'instant, on ajoute juste un message de bienvenue
        // Plus tard, on pourra implémenter le chargement depuis Supabase
        addMessage('🤖 Bonjour ! Je suis votre assistant DevOps intelligent avec IA.', 'bot', new Date().toISOString());
        addMessage('Je peux vous aider avec les déploiements, monitoring, erreurs et optimisation DevOps.', 'bot', new Date().toISOString());
        
        // Vérifier si l'IA est configurée
        const config = await loadUserConfig();
        if (!config) {
            addMessage('🤖 Pour activer les réponses intelligentes, veuillez configurer votre clé API. <a href="/configuration.html" style="color: #667eea; text-decoration: underline;">Configurer maintenant</a>', 'bot', new Date().toISOString());
        } else {
            addMessage(`🎉 IA configurée avec ${config.provider} ! Je peux maintenant vous fournir des réponses intelligentes spécialisées DevOps.`, 'bot', new Date().toISOString());
        }
    } catch (error) {
        console.error('Erreur chargement historique:', error);
        addMessage('🤖 Bonjour ! Je suis votre assistant DevOps.', 'bot', new Date().toISOString());
    }
}

// Gestionnaires d'événements
socket.on('connect', () => {
    console.log('Connecté au serveur');
    updateStatus('online');
});

socket.on('disconnect', () => {
    console.log('Déconnecté du serveur');
    updateStatus('offline');
});

socket.on('response', (data) => {
    addMessage(data.message, 'bot', data.timestamp);
});

// Envoi de message
function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        addMessage(message, 'user', new Date().toISOString());
        
        // Envoyer le message ; le serveur récupère la clé complète côté backend.
        // En fallback local (sans Supabase), on transmet la config locale.
        loadUserConfig().then(userConfig => {
            socket.emit('message', {
                message: message,
                userId: userId,
                userConfigLocal: userConfig && userConfig.source === 'local'
                    ? { apiKey: userConfig.apiKey, provider: userConfig.provider }
                    : null
            });
        });
        
        messageInput.value = '';
        messageInput.focus();
    }
}

// Envoi de message rapide
function sendQuickMessage(message) {
    messageInput.value = message;
    sendMessage();
}

// Gestion du clavier
function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Ajout de message dans le chat
function addMessage(text, sender, timestamp) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.innerHTML = sender === 'bot' 
        ? '<i class="material-icons">smart_toy</i>'
        : '<i class="material-icons">person</i>';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    // Traitement du texte pour les emojis et formatage
    const formattedText = formatMessage(text);
    content.innerHTML = formattedText;
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Animation d'apparition
    messageDiv.style.opacity = '0';
    messageDiv.style.transform = 'translateY(20px)';
    setTimeout(() => {
        messageDiv.style.transition = 'all 0.3s ease';
        messageDiv.style.opacity = '1';
        messageDiv.style.transform = 'translateY(0)';
    }, 10);
}

// Formatage des messages (emojis, liens, etc.)
function formatMessage(text) {
    // Conversion des textes emoji en emojis réels
    let formatted = text
        .replace(/🚀/g, '🚀')
        .replace(/📊/g, '📊')
        .replace(/🔍/g, '🔍')
        .replace(/⚡/g, '⚡')
        .replace(/👋/g, '👋')
        .replace(/🎯/g, '🎯')
        .replace(/✅/g, '✅')
        .replace(/❌/g, '❌')
        .replace(/⚠️/g, '⚠️')
        .replace(/💡/g, '💡');
    
    // Conversion des sauts de ligne
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Mise en évidence des mots-clés
    const keywords = ['erreur', 'déployer', 'monitoring', 'optimisation', 'performance'];
    keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        formatted = formatted.replace(regex, `<strong>${keyword}</strong>`);
    });
    
    return formatted;
}

// Mise à jour du statut
function updateStatus(status) {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-indicator span:last-child');
    
    if (status === 'online') {
        statusDot.className = 'status-dot online';
        statusText.textContent = 'En ligne';
    } else {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Hors ligne';
    }
}

// Mise à jour de l'uptime
function updateUptime() {
    const now = Date.now();
    const uptime = now - startTime;
    const hours = Math.floor(uptime / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    
    uptimeElement.textContent = `${hours}h ${minutes}m`;
}

// Animation des métriques
function animateMetrics() {
    const metrics = document.querySelectorAll('.metric-fill');
    metrics.forEach((metric, index) => {
        const targetWidth = metric.style.width;
        metric.style.width = '0%';
        setTimeout(() => {
            metric.style.width = targetWidth;
        }, 100 * index);
    });
}

// Simulation de métriques en temps réel
function updateMetrics() {
    const cpuMetric = document.querySelector('.metric:nth-child(1) .metric-fill');
    const memoryMetric = document.querySelector('.metric:nth-child(2) .metric-fill');
    const diskMetric = document.querySelector('.metric:nth-child(3) .metric-fill');
    
    const cpuValue = document.querySelector('.metric:nth-child(1) .metric-value');
    const memoryValue = document.querySelector('.metric:nth-child(2) .metric-value');
    const diskValue = document.querySelector('.metric:nth-child(3) .metric-value');
    
    // Simulation de variations aléatoires
    const cpu = Math.floor(Math.random() * 30) + 30; // 30-60%
    const memory = Math.floor(Math.random() * 20) + 50; // 50-70%
    const disk = Math.floor(Math.random() * 10) + 70; // 70-80%
    
    cpuMetric.style.width = cpu + '%';
    memoryMetric.style.width = memory + '%';
    diskMetric.style.width = disk + '%';
    
    cpuValue.textContent = cpu + '%';
    memoryValue.textContent = memory + '%';
    diskValue.textContent = disk + '%';
}

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
    // Focus sur l'input
    messageInput.focus();
    
    // Charger l'historique et la configuration depuis Supabase
    await loadConversationHistory();
    
    // Animation initiale des métriques
    setTimeout(animateMetrics, 500);
    
    // Mise à jour périodique
    setInterval(updateUptime, 60000); // Chaque minute
    setInterval(updateMetrics, 5000); // Chaque 5 secondes
    
    // Gestion du bouton d'envoi
    sendButton.addEventListener('click', sendMessage);
    
    // Mettre à jour le statut IA dans l'interface
    const config = await loadUserConfig();
    const aiStatusElement = document.getElementById('aiStatus');
    if (config) {
        const sourceLabel = config.source === 'local' ? ' (local)' : '';
        aiStatusElement.textContent = '✅ ' + config.provider + sourceLabel;
        aiStatusElement.style.color = '#4caf50';
    } else {
        aiStatusElement.textContent = '⚠️ Non configurée';
        aiStatusElement.style.color = '#ff9800';
    }
});

// Gestion des erreurs
socket.on('connect_error', (error) => {
    console.error('Erreur de connexion:', error);
    addMessage('❌ Impossible de se connecter au serveur. Vérifiez votre connexion.', 'bot', new Date().toISOString());
});

// Notifications visuelles
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Animations CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .notification {
        font-family: 'Inter', sans-serif;
        font-weight: 500;
    }
`;
document.head.appendChild(style);
