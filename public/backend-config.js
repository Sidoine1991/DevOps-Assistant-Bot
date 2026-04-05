/**
 * API / Socket.IO : production sur Render.
 * https://devops-assistant-bot-1wcp.onrender.com/
 *
 * - Même hôte Render → requêtes relatives (même origine).
 * - Dev local (localhost:3000, etc.) → même origine locale.
 * - APK / WebView Capacitor (souvent https://localhost sans :3000) → Render.
 */
(function () {
  var RENDER_BASE = 'https://devops-assistant-bot-1wcp.onrender.com';
  var RENDER_HOST = 'devops-assistant-bot-1wcp.onrender.com';

  if (typeof window.DEVOPS_API_BASE === 'string' && window.DEVOPS_API_BASE.length) {
    window.DEVOPS_API_BASE = window.DEVOPS_API_BASE.replace(/\/$/, '');
    return;
  }

  var h = window.location.hostname || '';
  var port = String(window.location.port || '');

  if (h === RENDER_HOST) {
    window.DEVOPS_API_BASE = '';
    return;
  }

  try {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      window.DEVOPS_API_BASE = RENDER_BASE;
      return;
    }
  } catch (e) {}

  var localPorts = { '3000': true, '3001': true, '8080': true };
  if ((h === 'localhost' || h === '127.0.0.1') && localPorts[port]) {
    window.DEVOPS_API_BASE = '';
    return;
  }

  if (h === 'localhost' || h === '127.0.0.1') {
    window.DEVOPS_API_BASE = RENDER_BASE;
    return;
  }

  window.DEVOPS_API_BASE = RENDER_BASE;
})();
