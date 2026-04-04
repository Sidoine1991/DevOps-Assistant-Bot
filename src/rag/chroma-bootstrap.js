const { AdminClient, ChromaClient } = require('chromadb');

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
  ensureChromaTenantAndDatabase,
  createChromaClient,
};
