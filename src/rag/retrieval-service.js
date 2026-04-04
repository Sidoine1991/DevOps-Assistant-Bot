const { DefaultEmbeddingFunction } = require('@chroma-core/default-embed');
const ChromaBackupManager = require('./chroma-backup-manager');
const {
  parseChromaConnection,
  formatChromaConnectionSummary,
  connectionKey,
} = require('./chroma-client-url');
const {
  assertChromaReachable,
  chromaHeartbeatTimeoutMs,
  ensureChromaTenantAndDatabase,
  createChromaClient,
} = require('./chroma-bootstrap');

class RetrievalService {
  constructor() {
    this.enabled = process.env.RAG_ENABLED !== 'false';
    this.collectionName = process.env.RAG_COLLECTION || 'devops_courses';
    this.chromaHost = process.env.CHROMA_HOST || '127.0.0.1';
    this.chromaPort = Number(process.env.CHROMA_PORT || 8000);
    this.chromaSsl = process.env.CHROMA_SSL === 'true';
    this.chromaUrl = process.env.CHROMA_URL || '';
    this.chromaFallbackUrl = process.env.CHROMA_FALLBACK_URL || '';
    this.defaultTopK = Number(process.env.RAG_RETRIEVAL_TOP_K || 16);
    this.minSourceDiversity = Number(process.env.RAG_MIN_SOURCE_DIVERSITY || 3);
    this.maxChunksPerSource = Number(process.env.RAG_MAX_CHUNKS_PER_SOURCE || 4);
    this.client = null;
    this.collection = null;
    this.gemini = null;
    this.embeddingFunction = new DefaultEmbeddingFunction();
    this.backupManager = new ChromaBackupManager();
    this._initPromise = null;
  }

  getChromaClientCandidates() {
    const primary = parseChromaConnection({
      chromaUrl: this.chromaUrl,
      chromaHost: this.chromaHost,
      chromaPort: this.chromaPort,
      chromaSsl: this.chromaSsl,
    });
    const list = [primary];
    if (this.chromaFallbackUrl) {
      const fb = parseChromaConnection({
        chromaUrl: this.chromaFallbackUrl,
        chromaHost: this.chromaHost,
        chromaPort: this.chromaPort,
        chromaSsl: this.chromaSsl,
      });
      if (connectionKey(fb) !== connectionKey(primary)) {
        list.push(fb);
      }
    }
    return list;
  }

  getChromaPath() {
    return formatChromaConnectionSummary(
      parseChromaConnection({
        chromaUrl: this.chromaUrl,
        chromaHost: this.chromaHost,
        chromaPort: this.chromaPort,
        chromaSsl: this.chromaSsl,
      })
    );
  }

  /**
   * Connexion Chroma + chargement de la collection. Idempotent : les appels suivants
   * réutilisent la même promesse (évite courses au démarrage / premières questions).
   */
  async initialize() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._initializeOnce();
    return this._initPromise;
  }

  async _initializeOnce() {
    if (!this.enabled) {
      console.log('RAG désactivé (RAG_ENABLED=false)');
      return;
    }

    try {
      const candidates = this.getChromaClientCandidates();
      let connected = false;
      let lastError = null;

      for (const chromaArgs of candidates) {
        try {
          await assertChromaReachable(chromaArgs, chromaHeartbeatTimeoutMs(chromaArgs));
          await ensureChromaTenantAndDatabase(chromaArgs);
          this.client = createChromaClient(chromaArgs);
          try {
            this.collection = await this.client.getCollection({
              name: this.collectionName,
              embeddingFunction: this.embeddingFunction,
            });
          } catch (collectionError) {
            // Si la collection n'existe pas encore, on la crée pour activer le mode RAG.
            const msg = String(collectionError && collectionError.message ? collectionError.message : collectionError);
            // chromadb renvoie souvent « The requested resource could not be found » (sans sous-chaîne exacte « not found »).
            if (/not found|could not be found|does not exist|404|no such collection|unknown collection/i.test(msg)) {
              this.collection = await this.client.getOrCreateCollection({
                name: this.collectionName,
                embeddingFunction: this.embeddingFunction,
              });
              console.log(`ℹ️ Collection Chroma prête: "${this.collectionName}"`);
            } else {
              throw collectionError;
            }
          }
          console.log(
            `✅ RAG initialisé avec la collection Chroma "${this.collectionName}" (${formatChromaConnectionSummary(chromaArgs)})`
          );
          connected = true;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!connected && this.backupManager.hasBackupConfigured()) {
        console.warn('RAG: tentative de restauration automatique depuis le backup zip...');
        const restored = await this.backupManager.restoreBackup();
        if (restored) {
          for (const chromaArgs of candidates) {
            try {
              await assertChromaReachable(chromaArgs, chromaHeartbeatTimeoutMs(chromaArgs));
              await ensureChromaTenantAndDatabase(chromaArgs);
              this.client = createChromaClient(chromaArgs);
              this.collection = await this.client.getCollection({
                name: this.collectionName,
                embeddingFunction: this.embeddingFunction,
              });
              console.log(
                `✅ RAG restauré via backup puis reconnecté (${formatChromaConnectionSummary(chromaArgs)})`
              );
              connected = true;
              break;
            } catch (error) {
              lastError = error;
            }
          }
        }
      }

      if (!connected) {
        throw lastError || new Error('Connexion Chroma impossible');
      }
    } catch (error) {
      const chromaPath = this.getChromaPath();
      console.warn(
        `⚠️ RAG indisponible (${chromaPath}). ` +
        'Le bot continue en mode fallback IA classique.'
      );
      console.warn('Détail RAG:', error.message);
      this.enabled = false;
      this.collection = null;
    }
  }

  async embedQuery(query) {
    // Plus besoin de générer explicitement: l’embeddingFunction est attachée à la collection.
    // Gardé pour compat, mais non utilisé.
    return null;
  }

  stripAccents(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /** Sous-chaînes pour whereDocument ($contains) si la recherche vectorielle ne renvoie rien. */
  keywordSearchTermsFromQuery(query) {
    const q = this.stripAccents(String(query || '').toLowerCase());
    const terms = [];
    const add = (t) => {
      if (t && !terms.includes(t)) terms.push(t);
    };
    if (/conten|docker|k8s|kubernetes|dockerfile|image docker|container/.test(q)) {
      add('docker');
      add('Docker');
      add('conteneur');
      add('Conteneur');
      add('container');
      add('Container');
    }
    if (/virtual|hypervis|\bvm\b|machine virtuelle|virtualis/.test(q)) {
      add('virtual');
      add('Virtual');
      add('hyperviseur');
      add('Hyperviseur');
      add('VM');
    }
    if (/devops|\bci\b|\bcd\b|pipeline|deploi|deploy|integrat/.test(q)) {
      add('DevOps');
      add('CI/CD');
      add('pipeline');
      add('Pipeline');
    }
    return terms.slice(0, 14);
  }

  async retrieveKeywordFallbackChunks(query, limit) {
    const terms = this.keywordSearchTermsFromQuery(query);
    if (terms.length === 0) return [];
    const out = [];
    const seen = new Set();
    const perTerm = Math.min(40, Math.max(limit, 20));
    for (const term of terms) {
      try {
        const r = await this.collection.get({
          whereDocument: { $contains: term },
          limit: perTerm,
          include: ['documents', 'metadatas'],
        });
        const docs = r.documents || [];
        const metas = r.metadatas || [];
        for (let i = 0; i < docs.length; i++) {
          const doc = docs[i];
          if (doc == null || !String(doc).trim()) continue;
          const meta = metas[i] || {};
          const fp = `${meta.source || ''}:${String(doc).slice(0, 160)}`;
          if (seen.has(fp)) continue;
          seen.add(fp);
          out.push({
            content: doc,
            metadata: meta,
            distance: 0.5 + out.length * 0.0001,
          });
          if (out.length >= limit) return out;
        }
      } catch (e) {
        console.warn(`RAG whereDocument "${term}" ignoré:`, (e && e.message) || e);
      }
    }
    return out;
  }

  async retrieveRelevantChunks(query, topK = this.defaultTopK) {
    await this.initialize();
    if (!this.enabled || !this.collection) return [];

    try {
      const overFetch = Math.max(topK * 4, topK + 12);
      const results = await this.collection.query({ queryTexts: [query], nResults: overFetch });

      const documents = results.documents?.[0] || [];
      const metadatas = results.metadatas?.[0] || [];
      const distances = results.distances?.[0] || [];

      let flat = documents
        .map((doc, idx) => ({
          content: doc,
          metadata: metadatas[idx] || {},
          distance: typeof distances[idx] === 'number' ? distances[idx] : Number.MAX_SAFE_INTEGER,
        }))
        .filter((item) => item.content != null && String(item.content).trim().length > 0);

      if (flat.length === 0) {
        flat = await this.retrieveKeywordFallbackChunks(query, overFetch);
        if (flat.length > 0) {
          console.log(
            `RAG: recherche plein-texte (whereDocument) — ${flat.length} passage(s) pour « ${String(query).slice(0, 90)}… »`
          );
        }
      }

      if (flat.length === 0) return [];

      // Diversifie les sources pour éviter qu'un seul PDF domine toute la réponse.
      const grouped = new Map();
      for (const chunk of flat) {
        const source = chunk?.metadata?.source || 'cours';
        if (!grouped.has(source)) grouped.set(source, []);
        grouped.get(source).push(chunk);
      }

      for (const items of grouped.values()) {
        items.sort((a, b) => a.distance - b.distance);
      }

      const sourcesOrdered = [...grouped.entries()]
        .sort((a, b) => a[1][0].distance - b[1][0].distance)
        .map(([source]) => source);

      const selected = [];
      const counters = new Map();
      let passes = 0;
      while (selected.length < topK && passes < overFetch) {
        let advanced = false;
        for (const source of sourcesOrdered) {
          const sourceChunks = grouped.get(source) || [];
          const used = counters.get(source) || 0;
          if (used >= sourceChunks.length) continue;
          if (used >= this.maxChunksPerSource) continue;
          selected.push(sourceChunks[used]);
          counters.set(source, used + 1);
          advanced = true;
          if (selected.length >= topK) break;
        }
        if (!advanced) break;
        passes += 1;
      }

      if (selected.length < topK) {
        const already = new Set(selected.map((item) => `${item.metadata?.source || 'cours'}:${item.metadata?.index ?? ''}:${item.distance}`));
        for (const item of flat.sort((a, b) => a.distance - b.distance)) {
          const key = `${item.metadata?.source || 'cours'}:${item.metadata?.index ?? ''}:${item.distance}`;
          if (already.has(key)) continue;
          selected.push(item);
          if (selected.length >= topK) break;
        }
      }

      const uniqueSources = new Set(selected.map((c) => c?.metadata?.source || 'cours'));
      if (uniqueSources.size < this.minSourceDiversity) {
        console.warn(`RAG: diversité faible (${uniqueSources.size} source(s)) pour "${query}"`);
      }
      return selected.slice(0, topK).map(({ content, metadata }) => ({ content, metadata }));
    } catch (error) {
      console.error('Erreur RAG lors de la récupération des chunks:', error);
      return [];
    }
  }
}

module.exports = RetrievalService;

