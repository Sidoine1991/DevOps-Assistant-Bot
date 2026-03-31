const { ChromaClient } = require('chromadb');

class RetrievalService {
  constructor() {
    this.enabled = process.env.RAG_ENABLED !== 'false';
    this.collectionName = process.env.RAG_COLLECTION || 'devops_courses';
    this.chromaHost = process.env.CHROMA_HOST || 'localhost';
    this.chromaPort = Number(process.env.CHROMA_PORT || 8000);
    this.chromaSsl = process.env.CHROMA_SSL === 'true';
    this.client = null;
    this.collection = null;
    this.gemini = null;
  }

  async initialize() {
    if (!this.enabled) {
      console.log('RAG désactivé (RAG_ENABLED != true)');
      return;
    }

    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        console.warn('GEMINI_API_KEY manquante, RAG désactivé');
        this.enabled = false;
        return;
      }

      this.gemini = new GoogleGenerativeAI(geminiKey).getGenerativeModel({ model: 'gemini-embedding-001' });
      this.client = new ChromaClient({
        host: this.chromaHost,
        port: this.chromaPort,
        ssl: this.chromaSsl,
      });
      this.collection = await this.client.getCollection({ name: this.collectionName });

      console.log(`✅ RAG initialisé avec la collection Chroma "${this.collectionName}" (${this.chromaHost}:${this.chromaPort})`);
    } catch (error) {
      console.error('❌ Erreur initialisation RAG:', error);
      this.enabled = false;
    }
  }

  async embedQuery(query) {
    if (!this.gemini) return null;
    const result = await this.gemini.embedContent(query);
    return result.embedding.values;
  }

  async retrieveRelevantChunks(query, topK = 4) {
    if (!this.enabled || !this.collection) return [];

    try {
      const queryEmbedding = await this.embedQuery(query);
      if (!queryEmbedding) return [];

      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK,
      });

      const documents = results.documents?.[0] || [];
      const metadatas = results.metadatas?.[0] || [];

      return documents.map((doc, idx) => ({
        content: doc,
        metadata: metadatas[idx] || {},
      }));
    } catch (error) {
      console.error('Erreur RAG lors de la récupération des chunks:', error);
      return [];
    }
  }
}

module.exports = RetrievalService;

