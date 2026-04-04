const http = require('http');
const https = require('https');
const { AdminClient, ChromaClient } = require('chromadb');

/**
 * Délai heartbeat : local court ; HTTPS distant long (ex. Render free = cold start 30–90 s).
 * Surcharge : RAG_CHROMA_HEARTBEAT_MS (millisecondes).
 */
function chromaHeartbeatTimeoutMs(chromaArgs) {
  const fromEnv = process.env.RAG_CHROMA_HEARTBEAT_MS;
  if (fromEnv != null && String(fromEnv).trim() !== '') {
    const n = Number(fromEnv);
    if (!Number.isNaN(n) && n >= 3000) return n;
  }
  const host = String(chromaArgs.host || '').toLowerCase();
  const isLocal = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (chromaArgs.ssl && !isLocal) return 120000;
  if (!isLocal) return 60000;
  return 8000;
}

/**
 * Vérifie que l’API Chroma répond (évite une stack obscure si rien n’écoute sur le port).
 */
function assertChromaReachable(chromaArgs, timeoutMs) {
  const ms = timeoutMs != null ? timeoutMs : chromaHeartbeatTimeoutMs(chromaArgs);
  return new Promise((resolve, reject) => {
    const mod = chromaArgs.ssl ? https : http;
    const req = mod.request(
      {
        hostname: chromaArgs.host,
        port: chromaArgs.port,
        path: '/api/v2/heartbeat',
        method: 'GET',
        timeout: ms,
      },
      (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
          return;
        }
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    );
    req.on('error', (e) => reject(e));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`aucune réponse sous ${ms} ms`));
    });
    req.end();
  });
}

function chromaTenant() {
  const t = process.env.CHROMA_TENANT;
  return t && String(t).trim() ? String(t).trim() : 'default_tenant';
}

function chromaDatabase() {
  const d = process.env.CHROMA_DATABASE;
  return d && String(d).trim() ? String(d).trim() : 'default_database';
}

function isNotFound(err) {
  const n = err && err.name;
  const m = String((err && err.message) || err || '');
  return n === 'ChromaNotFoundError' || /could not be found|not found|404/i.test(m);
}

function isAlreadyExists(err) {
  const n = err && err.name;
  const m = String((err && err.message) || err || '');
  return n === 'ChromaUniqueError' || /already exists|resource already exists|409/i.test(m);
}

/**
 * Crée le tenant et la base par défaut si besoin (Chroma HTTP API v2).
 * Sans cela, createCollection / getOrCreateCollection peuvent renvoyer 404 avec chromadb@3.x.
 */
async function ensureChromaTenantAndDatabase(chromaArgs) {
  const admin = new AdminClient(chromaArgs);
  const tenant = chromaTenant();
  const database = chromaDatabase();

  try {
    await admin.getTenant({ name: tenant });
  } catch (e) {
    if (!isNotFound(e)) throw e;
    try {
      await admin.createTenant({ name: tenant });
    } catch (ce) {
      if (!isAlreadyExists(ce)) throw ce;
    }
  }

  try {
    await admin.getDatabase({ name: database, tenant });
  } catch (e) {
    if (!isNotFound(e)) throw e;
    try {
      await admin.createDatabase({ name: database, tenant });
    } catch (ce) {
      if (!isAlreadyExists(ce)) throw ce;
    }
  }
}

function createChromaClient(chromaArgs) {
  return new ChromaClient({
    ...chromaArgs,
    tenant: chromaTenant(),
    database: chromaDatabase(),
  });
}

module.exports = {
  chromaTenant,
  chromaDatabase,
  chromaHeartbeatTimeoutMs,
  assertChromaReachable,
  ensureChromaTenantAndDatabase,
  createChromaClient,
};
