// Connexion WebSocket au serveur (compatible front/back séparés)
const socketBase = (window.DEVOPS_API_BASE || '').trim();
const socket = socketBase
    ? io(socketBase, { transports: ['websocket', 'polling'] })
    : io({ transports: ['websocket', 'polling'] });
let startTime = Date.now();
let lastServerUptimeSeconds = null;
let lastServerUptimeAt = null;
let userId = localStorage.getItem('devops-user-id') || 'user-' + Math.random().toString(36).substr(2, 9);
let currentConversationId = null;
let conversations = [];
let isUserVerified = localStorage.getItem('devops-user-verified') === 'true';
let pendingAttachments = [];
let attachmentInput = document.getElementById('attachmentInput');
let attachmentPreview = document.getElementById('attachmentPreview');
let attachButton = document.getElementById('attachButton');

// Sauvegarder l'ID utilisateur pour la session
localStorage.setItem('devops-user-id', userId);

// Éléments DOM
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const uptimeElement = document.getElementById('uptime');
const newConversationBtn = document.getElementById('newConversationBtn');
const clearConversationBtn = document.getElementById('clearConversationBtn');
const conversationHistoryList = document.getElementById('conversationHistoryList');
let conversationRows = [];
let currentTranscript = [];
let lastSentMessage = '';

// Gestion des conversations
class ConversationManager {
    constructor() {
        this.conversations = [];
        this.currentConversationId = null;
        this.loadConversations();
    }

    // Générer un ID de conversation unique
    generateConversationId() {
        return 'conv-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    // Créer une nouvelle conversation
    createNewConversation() {
        const conversationId = this.generateConversationId();
        const conversation = {
            id: conversationId,
            title: 'Nouvelle conversation',
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.conversations.unshift(conversation);
        this.currentConversationId = conversationId;
        this.saveConversations();
        this.clearChatMessages();
        this.updateConversationHistory();
        this.showConversationIndicator(conversationId);

        return conversationId;
    }

    // Charger les conversations depuis localStorage
    loadConversations() {
        const saved = localStorage.getItem('conversations');
        if (saved) {
            try {
                this.conversations = JSON.parse(saved);
            } catch (error) {
                console.error('Erreur chargement conversations:', error);
                this.conversations = [];
            }
        }

        // Si aucune conversation, en créer une
        if (this.conversations.length === 0) {
            this.createNewConversation();
        } else {
            // Charger la dernière conversation
            this.currentConversationId = this.conversations[0].id;
            this.loadConversation(this.currentConversationId);
        }

        this.updateConversationHistory();
    }

    // Sauvegarder les conversations dans localStorage
    saveConversations() {
        try {
            localStorage.setItem('conversations', JSON.stringify(this.conversations));
        } catch (error) {
            console.error('Erreur sauvegarde conversations:', error);
        }
    }

    // Charger une conversation spécifique
    loadConversation(conversationId) {
        const conversation = this.conversations.find(c => c.id === conversationId);
        if (conversation) {
            this.currentConversationId = conversationId;
            this.clearChatMessages();
            
            // Recharger les messages
            conversation.messages.forEach(msg => {
                addMessage(msg.content, msg.type, msg.timestamp);
            });

            this.updateConversationHistory();
            this.showConversationIndicator(conversationId);
        }
    }

    // Ajouter un message à la conversation actuelle
    addMessage(content, type, timestamp) {
        if (!this.currentConversationId) {
            this.createNewConversation();
        }

        const conversation = this.conversations.find(c => c.id === this.currentConversationId);
        if (conversation) {
            const message = { content, type, timestamp };
            conversation.messages.push(message);
            conversation.updatedAt = new Date().toISOString();
            
            // Mettre à jour le titre si c'est le premier message utilisateur
            if (type === 'user' && conversation.messages.length === 1) {
                conversation.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
            }

            this.saveConversations();
            this.updateConversationHistory();
        }
    }

    // Effacer la conversation actuelle
    clearCurrentConversation() {
        if (this.currentConversationId) {
            const conversation = this.conversations.find(c => c.id === this.currentConversationId);
            if (conversation) {
                conversation.messages = [];
                conversation.updatedAt = new Date().toISOString();
                this.saveConversations();
                this.clearChatMessages();
                this.updateConversationHistory();
            }
        }
    }

    // Supprimer une conversation
    deleteConversation(conversationId) {
        const index = this.conversations.findIndex(c => c.id === conversationId);
        if (index !== -1) {
            this.conversations.splice(index, 1);
            
            if (this.currentConversationId === conversationId) {
                if (this.conversations.length > 0) {
                    this.loadConversation(this.conversations[0].id);
                } else {
                    this.createNewConversation();
                }
            }

            this.saveConversations();
            this.updateConversationHistory();
        }
    }

    // Effacer tous les messages du chat
    clearChatMessages() {
        chatMessages.innerHTML = '';
    }

    // Mettre à jour l'affichage de l'historique
    updateConversationHistory() {
        conversationHistoryList.innerHTML = '';

        this.conversations.forEach(conversation => {
            const item = document.createElement('div');
            item.className = 'conversation-item';
            if (conversation.id === this.currentConversationId) {
                item.classList.add('active');
            }

            const lastMessage = conversation.messages[conversation.messages.length - 1];
            const preview = lastMessage ? lastMessage.content.substring(0, 50) + '...' : 'Aucun message';

            item.innerHTML = `
                <div class="conversation-item-title">${conversation.title}</div>
                <div class="conversation-item-preview">${preview}</div>
                <div class="conversation-item-time">${new Date(conversation.updatedAt).toLocaleString()}</div>
                <div class="conversation-item-actions">
                    <button onclick="conversationManager.deleteConversation('${conversation.id}')" title="Supprimer">
                        <i class="material-icons">delete</i>
                    </button>
                </div>
            `;

            item.addEventListener('click', (e) => {
                if (!e.target.closest('.conversation-item-actions')) {
                    this.loadConversation(conversation.id);
                }
            });

            conversationHistoryList.appendChild(item);
        });
    }

    // Afficher l'indicateur de conversation actuelle
    showConversationIndicator(conversationId) {
        const conversation = this.conversations.find(c => c.id === conversationId);
        if (conversation) {
            // Ajouter un indicateur visuel de la conversation actuelle
            const indicator = document.createElement('div');
            indicator.className = 'conversation-indicator';
            indicator.innerHTML = `
                <i class="material-icons">chat</i>
                ${conversation.title}
            `;
            
            // Insérer au début des messages
            const existingIndicator = chatMessages.querySelector('.conversation-indicator');
            if (existingIndicator) {
                existingIndicator.replaceWith(indicator);
            } else {
                chatMessages.insertBefore(indicator, chatMessages.firstChild);
            }
        }
    }
}

// Initialiser le gestionnaire de conversations
const conversationManager = new ConversationManager();

// Fonctions de notification
function showNotification(message, type = 'info') {
    // Créer une notification simple
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#4caf50' : type === 'error' ? '#f44336' : '#2196f3'};
        color: white;
        border-radius: 8px;
        z-index: 9999;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Auto-suppression après 3 secondes
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Ajouter les animations CSS si elles n'existent pas
if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// Service de configuration client (fallback local)
const clientConfigService = {
    hasConfig: async function() {
        return localStorage.getItem('devops-config') !== null;
    },
    
    loadConfig: async function() {
        try {
            const config = localStorage.getItem('devops-config');
            return config ? JSON.parse(config) : null;
        } catch (error) {
            console.error('Erreur chargement config locale:', error);
            return null;
        }
    },
    
    saveConfig: async function(config) {
        try {
            localStorage.setItem('devops-config', JSON.stringify(config));
            return true;
        } catch (error) {
            console.error('Erreur sauvegarde config locale:', error);
            return false;
        }
    },
    
    clearConfig: async function() {
        try {
            localStorage.removeItem('devops-config');
            return true;
        } catch (error) {
            console.error('Erreur suppression config locale:', error);
            return false;
        }
    }
};

// Charger la configuration utilisateur depuis Supabase
async function loadUserConfig() {
    try {
        const response = await fetch(window.apiUrl(`/api/config/load/${userId}`));
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
        const response = await fetch(window.apiUrl(`/api/conversations/${userId}?limit=120`));
        const result = await response.json();
        chatMessages.innerHTML = '';
        currentTranscript = [];

        if (result.success && Array.isArray(result.conversations) && result.conversations.length > 0) {
            conversationRows = [...result.conversations].reverse();
            conversationRows.forEach((row) => {
                addMessage(row.user_message, 'user', row.created_at);
                addMessage(row.bot_response, 'bot', row.created_at);
            });
            renderConversationHistoryList();
        } else {
            addMessage('🤖 Bonjour ! Je suis votre assistant DevOps intelligent avec IA.', 'bot', new Date().toISOString());
            addMessage('Je peux vous aider avec les déploiements, monitoring, erreurs et optimisation DevOps.', 'bot', new Date().toISOString());
        }
    } catch (error) {
        console.error('Erreur chargement historique:', error);
        addMessage('🤖 Bonjour ! Je suis votre assistant DevOps.', 'bot', new Date().toISOString());
    }
}

// Gestionnaires d'événements pour les boutons de conversation
if (newConversationBtn) {
    newConversationBtn.addEventListener('click', () => {
        conversationManager.createNewConversation();
        showNotification('Nouvelle conversation créée', 'success');
    });
}

if (clearConversationBtn) {
    clearConversationBtn.addEventListener('click', () => {
        if (confirm('Êtes-vous sûr de vouloir effacer la conversation actuelle ?')) {
            conversationManager.clearCurrentConversation();
            showNotification('Conversation effacée', 'success');
        }
    });
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

function removeTypingIndicator() {
    const el = document.getElementById('chatTypingIndicator');
    if (el) el.remove();
}

function showTypingIndicator() {
    removeTypingIndicator();
    if (!chatMessages) return;
    const messageDiv = document.createElement('div');
    messageDiv.id = 'chatTypingIndicator';
    messageDiv.className = 'message bot-message typing-indicator-wrap';
    messageDiv.setAttribute('aria-live', 'polite');
    messageDiv.setAttribute('aria-label', 'Le bot rédige une réponse');
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.innerHTML = '<i class="material-icons">smart_toy</i>';
    const content = document.createElement('div');
    content.className = 'message-content typing-indicator-content';
    content.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function finishAssistantReply() {
    removeTypingIndicator();
    setInputState(false);
}

socket.on('response', (data) => {
    finishAssistantReply();
    addMessage(data.message, 'bot', data.timestamp, data.sources || []);
    conversationRows.unshift({
        id: `live-${Date.now()}`,
        user_message: lastSentMessage,
        bot_response: data.message,
        created_at: data.timestamp
    });
    renderConversationHistoryList();
});

// Envoi de message
async function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function setInputState(isBusy) {
    sendButton.disabled = isBusy;
    sendButton.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    messageInput.disabled = isBusy;
}

async function sendMessage() {
    if (!isUserVerified) {
        showNotification('Vérifiez votre compte email avant d’utiliser le bot.', 'error');
        window.location.href = '/login.html';
        return;
    }
    const message = messageInput.value.trim();
    if (message) {
        lastSentMessage = message;
        addMessage(message, 'user', new Date().toISOString());
        setInputState(true);
        showTypingIndicator();

        loadUserConfig()
            .then((userConfig) => {
                socket.emit('message', {
                    message: message,
                    userId: userId,
                    userConfigLocal: userConfig && userConfig.source === 'local'
                        ? { apiKey: userConfig.apiKey, provider: userConfig.provider }
                        : null,
                    attachments: pendingAttachments
                });
            })
            .catch(() => {
                finishAssistantReply();
                showNotification('Impossible de charger la configuration.', 'error');
            });

        messageInput.value = '';
        pendingAttachments = [];
        attachmentPreview.textContent = '';
        attachmentInput.value = '';
        messageInput.focus();
    }
}

function setAuthVerified(user) {
    isUserVerified = true;
    if (user && user.id) {
        userId = user.id;
    }
    localStorage.setItem('devops-user-id', userId);
    localStorage.setItem('devops-user-verified', 'true');
}

function logout() {
    localStorage.removeItem('devops-user-id');
    localStorage.removeItem('devops-user-verified');
    localStorage.removeItem('devops-user-name');
    window.location.href = '/login.html';
}

async function refreshConnectedUsers() {
    try {
        const connectedRes = await fetch(window.apiUrl('/api/users/connected'));
        const connected = await connectedRes.json();
        const connectedInfo = document.getElementById('connectedUsersInfo');
        if (connectedInfo && connected.success) {
            connectedInfo.textContent =
                `Sessions navigateur (Socket): ${connected.sockets} · Comptes identifiés sur cette instance: ${connected.authenticatedUsers}`;
        }
    } catch (error) {
        // silencieux
    }
}

async function loadBotRuntimeStatus(userConfig) {
    try {
        const res = await fetch(window.apiUrl('/api/bot/status'));
        const status = await res.json();
        if (!status || status.bot !== 'online') return;

        const versionEl = document.getElementById('botVersion');
        if (versionEl) {
            versionEl.textContent = status.version || '-';
        }

        const servicesEl = document.getElementById('servicesCount');
        if (servicesEl) {
            if (Array.isArray(status.components) && status.components.length) {
                const labels = status.components
                    .map((c) => `${c.label || c.id}: ${c.status === 'active' ? 'OK' : '—'}`)
                    .join(' · ');
                servicesEl.textContent = status.componentsSummary || '-';
                servicesEl.title = labels;
            } else {
                const services = status.services && typeof status.services === 'object' ? status.services : {};
                const activeCount = Object.values(services).filter((v) => v === 'active').length;
                servicesEl.textContent = `${activeCount} actif${activeCount > 1 ? 's' : ''}`;
                servicesEl.removeAttribute('title');
            }
        }

        if (typeof status.uptimeSeconds === 'number' && !Number.isNaN(status.uptimeSeconds)) {
            lastServerUptimeSeconds = status.uptimeSeconds;
            lastServerUptimeAt = Date.now();
            updateUptime();
        }

        const aiStatusElement = document.getElementById('aiStatus');
        const aiBadgeElement = document.getElementById('aiBadge');
        if (aiStatusElement && aiBadgeElement) {
            aiBadgeElement.removeAttribute('title');
            const hasCloud = !!status.hasAIConfig;
            const rag =
                status.rag && typeof status.rag.operational === 'boolean'
                    ? status.rag.operational
                    : !!(status.rag && status.rag.enabled);
            const choseLocalRag = !!(userConfig && userConfig.provider === 'local-rag');
            const sourceLabel = userConfig && userConfig.source === 'local' ? ' (config locale)' : '';
            const pref =
                userConfig && userConfig.provider && userConfig.provider !== 'local-rag'
                    ? userConfig.provider
                    : null;

            if (choseLocalRag && rag) {
                aiStatusElement.textContent = '✅ Mode RAG documentaire' + sourceLabel;
                aiStatusElement.style.color = '#4caf50';
                aiBadgeElement.textContent = 'IA: corpus documentaire (votre choix)' + sourceLabel;
                aiBadgeElement.className = 'ai-badge success';
            } else if (choseLocalRag && !rag && hasCloud) {
                aiStatusElement.textContent =
                    '⚠️ Chroma indisponible — mode RAG local' + sourceLabel;
                aiStatusElement.style.color = '#ff9800';
                aiBadgeElement.textContent =
                    'RAG local : sans Chroma joignable, aucune réponse cloud automatique.';
                aiBadgeElement.title =
                    'Vous avez choisi le corpus documentaire. Les réponses ne passent pas par Gemini/OpenAI. Corrigez CHROMA_URL sur le serveur ou basculez vers OpenAI/Gemini dans Configuration.';
                aiBadgeElement.className = 'ai-badge warning';
            } else if (choseLocalRag && !rag && !hasCloud) {
                aiStatusElement.textContent = '⚠️ Chroma indisponible — pas d’IA cloud serveur' + sourceLabel;
                aiStatusElement.style.color = '#ff9800';
                aiBadgeElement.textContent =
                    'RAG local : ajoutez Chroma (CHROMA_URL) ou des clés IA serveur, ou passez à OpenAI/Gemini.';
                aiBadgeElement.title =
                    'Sans Chroma ni clés cloud sur le serveur, le mode corpus seul ne peut pas répondre. Ajustez la configuration.';
                aiBadgeElement.className = 'ai-badge warning';
            } else if (!choseLocalRag && rag && hasCloud) {
                aiStatusElement.textContent = '✅ RAG documentaire + IA cloud (serveur)';
                aiStatusElement.style.color = '#4caf50';
                aiBadgeElement.textContent = pref
                    ? `IA prête — RAG + votre fournisseur (${pref})`
                    : 'IA prête — RAG documentaire et clés cloud serveur';
                aiBadgeElement.className = 'ai-badge success';
            } else if (!choseLocalRag && !rag && hasCloud) {
                aiStatusElement.textContent = '✅ IA cloud (serveur) — sans corpus RAG ici';
                aiStatusElement.style.color = '#4caf50';
                aiBadgeElement.textContent = pref
                    ? `Réponses via ${pref} — corpus documentaire non connecté sur cette instance`
                    : 'Réponses via les clés IA du serveur — Chroma non connecté ou vide ici';
                aiBadgeElement.className = 'ai-badge success';
            } else if (!choseLocalRag && rag && !hasCloud) {
                aiStatusElement.textContent = '⚠️ RAG seul — pas de clés cloud serveur';
                aiStatusElement.style.color = '#ff9800';
                aiBadgeElement.textContent = 'Corpus documentaire OK, mais aucune clé Gemini/OpenAI côté serveur';
                aiBadgeElement.className = 'ai-badge warning';
            } else {
                aiStatusElement.textContent = '⚠️ IA non disponible sur ce serveur';
                aiStatusElement.style.color = '#ff9800';
                aiBadgeElement.textContent = 'Configurez Chroma et/ou des clés IA (serveur ou page Configuration)';
                aiBadgeElement.className = 'ai-badge warning';
            }
        }
    } catch (error) {
        // silencieux: garde les valeurs déjà affichées
    }
}

async function loadAccountOwner() {
    const accountOwner = document.getElementById('accountOwner');
    if (!accountOwner) return;

    const localName = localStorage.getItem('devops-user-name');
    if (localName) {
        accountOwner.textContent = localName;
    }

    try {
        const res = await fetch(window.apiUrl(`/api/auth/user/${userId}`));
        const result = await res.json();
        if (result.success && result.user) {
            const displayName = result.user.fullName || result.user.email || userId;
            accountOwner.textContent = displayName;
            if (result.user.fullName) {
                localStorage.setItem('devops-user-name', result.user.fullName);
            }
        }
    } catch (error) {
        // garder la valeur locale si dispo
    }
}

// Envoi de message rapide
function sendQuickMessage(message) {
    messageInput.value = message;
    sendMessage();
}

function formatConversationForExport() {
    return currentTranscript
        .map((item) => `[${new Date(item.timestamp || Date.now()).toLocaleString()}] ${item.sender === 'user' ? 'Vous' : 'Bot'}: ${item.text}`)
        .join('\n\n');
}

function exportConversation() {
    const content = formatConversationForExport();
    if (!content.trim()) {
        showNotification('Aucune conversation à exporter.', 'error');
        return;
    }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-devops-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function exportConversationHtml() {
    if (currentTranscript.length === 0) {
        showNotification('Aucune conversation à exporter.', 'error');
        return;
    }
    const rows = currentTranscript.map((item) => {
        const who = item.sender === 'user' ? 'Vous' : 'Bot';
        const date = new Date(item.timestamp || Date.now()).toLocaleString();
        const safeText = String(item.text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
        return `<div style="margin-bottom:12px;"><div style="font-weight:600">${who} - ${date}</div><div>${safeText}</div></div>`;
    }).join('\n');

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Conversation DevOps</title></head><body style="font-family:Arial,sans-serif;max-width:900px;margin:20px auto;padding:16px;"><h1>Export conversation DevOps Assistant</h1>${rows}</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-devops-${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

async function copyConversation() {
    const content = formatConversationForExport();
    if (!content.trim()) {
        showNotification('Aucune conversation à copier.', 'error');
        return;
    }
    await navigator.clipboard.writeText(content);
    showNotification('Conversation copiée.', 'success');
}

function renderConversationHistoryList() {
    const wrap = document.getElementById('conversationHistoryList');
    if (!wrap) return;
    const list = conversationRows.slice(0, 40);
    if (list.length === 0) {
        wrap.innerHTML = '<div class="history-item">Aucun historique disponible.</div>';
        return;
    }
    wrap.innerHTML = '';
    list.forEach((row) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        const preview = (row.user_message || row.bot_response || '').slice(0, 72);
        const ts = new Date(row.created_at || Date.now()).toLocaleString();
        item.textContent = `${ts} — ${preview}`;
        item.addEventListener('click', () => {
            if (row.user_message) {
                messageInput.value = row.user_message;
                messageInput.focus();
            } else if (row.bot_response) {
                navigator.clipboard.writeText(row.bot_response).then(() => {
                    showNotification('Réponse copiée.', 'success');
                });
            }
        });
        wrap.appendChild(item);
    });
}

// Gestion du clavier
function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Ajouter un message au chat
function addMessage(text, sender, timestamp, sources = []) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.innerHTML = sender === 'user' ? '<i class="material-icons">person</i>' : '<i class="material-icons">smart_toy</i>';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    // Convertir les sauts de ligne en <br>
    const formattedText = text.replace(/\n/g, '<br>');
    content.innerHTML = `<p>${formattedText}</p>`;
    
    // Ajouter les sources si présentes
    if (sources && sources.length > 0) {
        const sourcesDiv = document.createElement('div');
        sourcesDiv.className = 'message-sources';
        sourcesDiv.innerHTML = '<strong>Sources:</strong>';
        sources.forEach(source => {
            const sourceItem = document.createElement('div');
            sourceItem.className = 'message-source-item';
            sourceItem.innerHTML = `<a href="${source.url}" target="_blank">${source.title}</a>`;
            sourcesDiv.appendChild(sourceItem);
        });
        content.appendChild(sourcesDiv);
        const actionWrap = document.createElement('div');
        actionWrap.className = 'message-actions';
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'copy-output-btn';
        copyBtn.textContent = 'Copier output';
        copyBtn.addEventListener('click', async () => {
            await navigator.clipboard.writeText(text || '');
            showNotification('Output copié.', 'success');
        });
        actionWrap.appendChild(copyBtn);
        content.appendChild(actionWrap);
    }
    
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
    currentTranscript.push({ sender, text, timestamp });
}

// Formatage des messages (emojis, liens, etc.)
function formatMessage(text) {
    let formatted = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^### (.*)$/gm, '<h4>$1</h4>')
        .replace(/^## (.*)$/gm, '<h3>$1</h3>')
        .replace(/^# (.*)$/gm, '<h2>$1</h2>')
        .replace(/^- (.*)$/gm, '• $1')
        .replace(/\n/g, '<br>')
        .replace(/(\/generated\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

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
    const liveStatus = document.getElementById('connectionStatus');
    if (liveStatus) {
        liveStatus.textContent = status === 'online' ? 'Connecté au serveur' : 'Connexion perdue';
    }
}

// Mise à jour de l'uptime (priorité au temps serveur si synchronisé via /api/bot/status)
function updateUptime() {
    if (!uptimeElement) return;
    let totalSeconds;
    if (lastServerUptimeSeconds != null && lastServerUptimeAt != null) {
        totalSeconds = lastServerUptimeSeconds + Math.floor((Date.now() - lastServerUptimeAt) / 1000);
    } else {
        totalSeconds = Math.floor((Date.now() - startTime) / 1000);
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
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

// Initialisation — script chargé après DOMContentLoaded (bootstrap-chat.js), il faut lancer tout de suite si le doc est déjà prêt
async function initChatApp() {
    if (!isUserVerified) {
        window.location.href = '/login.html';
        return;
    }
    if (socket.connected) {
        updateStatus('online');
    }
    // Attacher tôt pour garder les actions UI utilisables même si l'API est lente/indisponible.
    sendButton.addEventListener('click', sendMessage);
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    // Focus sur l'input
    messageInput.focus();
    
    // Charger l'historique et la configuration depuis Supabase
    await loadConversationHistory();
    
    // Animation initiale des métriques
    setTimeout(animateMetrics, 500);
    
    // Mise à jour périodique (uptime: voir fin d’init après loadBotRuntimeStatus)
    setInterval(updateMetrics, 5000); // Chaque 5 secondes
    
    // Les listeners d'envoi et logout sont déjà attachés plus haut.
    const exportBtn = document.getElementById('exportConversationBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportConversation);
    const exportHtmlBtn = document.getElementById('exportConversationHtmlBtn');
    if (exportHtmlBtn) exportHtmlBtn.addEventListener('click', exportConversationHtml);
    const copyConversationBtn = document.getElementById('copyConversationBtn');
    if (copyConversationBtn) copyConversationBtn.addEventListener('click', copyConversation);
    attachButton.addEventListener('click', () => attachmentInput.click());
    attachmentInput.addEventListener('change', async (event) => {
        const files = Array.from(event.target.files || []).slice(0, 4);
        const loaded = [];
        const rejected = [];
        for (const file of files) {
            if (file.size > 12 * 1024 * 1024) {
                rejected.push(file.name);
                continue;
            }
            const data = await readFileAsDataURL(file);
            loaded.push({
                name: file.name,
                type: file.type || 'application/octet-stream',
                data,
            });
        }
        pendingAttachments = loaded;
        attachmentPreview.textContent = loaded.length > 0
            ? `Pièces jointes: ${loaded.map((f) => f.name).join(', ')}`
            : '';
        if (rejected.length > 0) {
            showNotification(`Fichiers ignorés (>12MB): ${rejected.join(', ')}`, 'error');
        }
    });

    await refreshConnectedUsers();
    setInterval(refreshConnectedUsers, 10000);
    await loadAccountOwner();

    const config = await loadUserConfig();
    await loadBotRuntimeStatus(config);
    updateUptime();
    setInterval(async () => {
        const c = await loadUserConfig();
        await loadBotRuntimeStatus(c);
    }, 30000);

    setInterval(updateUptime, 15000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatApp);
} else {
    initChatApp();
}

// Gestion des erreurs
socket.on('connect_error', (error) => {
    console.error('Erreur de connexion:', error);
    finishAssistantReply();
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
