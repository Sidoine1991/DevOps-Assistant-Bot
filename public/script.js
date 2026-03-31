// Connexion WebSocket (même origine ou DEVOPS_API_BASE si UI servie ailleurs)
const backendOrigin = typeof window !== 'undefined' && window.DEVOPS_API_BASE ? window.DEVOPS_API_BASE : '';
const socket = backendOrigin
  ? io(backendOrigin, { transports: ['websocket', 'polling'] })
  : io({ transports: ['websocket', 'polling'] });
let startTime = Date.now();
let userId = localStorage.getItem('devops-user-id') || 'user-' + Math.random().toString(36).substr(2, 9);
let isUserVerified = localStorage.getItem('devops-user-verified') === 'true';

// Sauvegarder l'ID utilisateur pour la session
localStorage.setItem('devops-user-id', userId);

// Éléments DOM
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const uptimeElement = document.getElementById('uptime');
const attachmentInput = document.getElementById('attachmentInput');
const attachButton = document.getElementById('attachButton');
const attachmentPreview = document.getElementById('attachmentPreview');
const clientConfigService = typeof ClientConfigService !== 'undefined' ? new ClientConfigService() : null;
let pendingAttachments = [];
let conversationRows = [];
let currentTranscript = [];
let lastSentMessage = '';

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
        
        // Envoyer le message ; le serveur récupère la clé complète côté backend.
        // En fallback local (sans Supabase), on transmet la config locale.
        loadUserConfig().then(userConfig => {
            socket.emit('message', {
                message: message,
                userId: userId,
                userConfigLocal: userConfig && userConfig.source === 'local'
                    ? { apiKey: userConfig.apiKey, provider: userConfig.provider }
                    : null,
                attachments: pendingAttachments
            });
        }).finally(() => {
            setInputState(false);
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
            connectedInfo.textContent = `Utilisateurs connectés: ${connected.sockets} (auth: ${connected.authenticatedUsers})`;
        }
    } catch (error) {
        // silencieux
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

// Ajout de message dans le chat
function addMessage(text, sender, timestamp, sources = []) {
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
    if (sender === 'bot' && Array.isArray(sources) && sources.length > 0) {
        const sourceWrap = document.createElement('div');
        sourceWrap.className = 'message-sources';
        sourceWrap.innerHTML = '<strong>Sources:</strong>';
        sources.forEach((source) => {
            const line = document.createElement('div');
            line.className = 'message-source-item';
            if (source.url) {
                const link = document.createElement('a');
                link.href = source.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = source.title || source.url;
                line.appendChild(link);
            } else {
                line.textContent = source.title || 'Source';
            }
            sourceWrap.appendChild(line);
        });
        content.appendChild(sourceWrap);
    }
    if (sender === 'bot') {
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
    if (!isUserVerified) {
        window.location.href = '/login.html';
        return;
    }
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
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
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
    
    // Mettre à jour le statut IA dans l'interface
    const config = await loadUserConfig();
    const aiStatusElement = document.getElementById('aiStatus');
    const aiBadgeElement = document.getElementById('aiBadge');
    if (config) {
        const sourceLabel = config.source === 'local' ? ' (local)' : '';
        const providerLabel = config.provider === 'local-rag' ? 'mode local RAG' : config.provider;
        aiStatusElement.textContent = '✅ ' + providerLabel + sourceLabel;
        aiStatusElement.style.color = '#4caf50';
        if (aiBadgeElement) {
            aiBadgeElement.textContent = `IA active: ${providerLabel}${sourceLabel}`;
            aiBadgeElement.className = 'ai-badge success';
        }
    } else {
        aiStatusElement.textContent = '⚠️ Non configurée';
        aiStatusElement.style.color = '#ff9800';
        if (aiBadgeElement) {
            aiBadgeElement.textContent = 'IA non configurée';
            aiBadgeElement.className = 'ai-badge warning';
        }
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
