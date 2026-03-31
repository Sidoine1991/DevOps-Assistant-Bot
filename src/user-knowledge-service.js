const { PDFParse } = require('pdf-parse');

class UserKnowledgeService {
  constructor(supabaseService) {
    this.supabaseService = supabaseService;
    this.chunkSize = Number(process.env.USER_KNOWLEDGE_CHUNK_SIZE || 1200);
    this.chunkOverlap = Number(process.env.USER_KNOWLEDGE_CHUNK_OVERLAP || 150);
    this.maxChunksPerDoc = Number(process.env.USER_KNOWLEDGE_MAX_CHUNKS_PER_DOC || 60);
  }

  chunkText(text) {
    const chunks = [];
    if (!text || text.trim().length === 0) {
      return chunks;
    }

    let start = 0;
    while (start < text.length && chunks.length < this.maxChunksPerDoc) {
      const end = Math.min(start + this.chunkSize, text.length);
      const chunk = text.slice(start, end).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
      if (end === text.length) {
        break;
      }
      start = Math.max(0, end - this.chunkOverlap);
    }
    return chunks;
  }

  async extractAttachmentText(attachment) {
    try {
      if (!attachment || !attachment.data || !attachment.type) return '';
      const base64 = attachment.data.split(',').pop();
      const raw = Buffer.from(base64, 'base64');
      const mime = attachment.type.toLowerCase();

      const fileName = (attachment.name || '').toLowerCase();
      const looksLikePdf = mime.includes('pdf') || fileName.endsWith('.pdf');
      if (looksLikePdf) {
        const parser = new PDFParse({ data: raw });
        try {
          const parsed = await parser.getText();
          return parsed.text ? parsed.text.slice(0, 120000) : '';
        } finally {
          await parser.destroy();
        }
      }

      if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') || mime.includes('log')) {
        return raw.toString('utf-8').slice(0, 120000);
      }

      return '';
    } catch (error) {
      console.warn('Extraction texte piece jointe impossible:', attachment?.name, error.message);
      return '';
    }
  }

  tokenize(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2);
  }

  scoreChunk(queryTokens, chunkText) {
    const chunkTokens = new Set(this.tokenize(chunkText));
    let score = 0;
    for (const token of queryTokens) {
      if (chunkTokens.has(token)) {
        score += 1;
      }
    }
    return score;
  }

  normalizeQuery(query = '') {
    let q = String(query || '').toLowerCase();
    q = q
      .replace(/dev ops/g, 'devops')
      .replace(/ci\/cd/g, 'ci cd')
      .replace(/contenurisation|contenerisation/g, 'conteneurisation');
    return q;
  }

  async ingestAttachments(userId, attachments = []) {
    if (!userId || !Array.isArray(attachments) || attachments.length === 0) {
      return { ingestedChunks: 0, ingestedFiles: 0 };
    }

    let ingestedChunks = 0;
    let ingestedFiles = 0;

    for (const attachment of attachments.slice(0, 6)) {
      const text = await this.extractAttachmentText(attachment);
      if (!text || text.trim().length < 20) {
        continue;
      }

      const chunks = this.chunkText(text);
      if (chunks.length === 0) {
        continue;
      }

      const rows = chunks.map((chunk, index) => ({
        user_id: userId,
        source_name: attachment.name || 'document',
        source_type: attachment.type || 'application/octet-stream',
        chunk_index: index,
        chunk_text: chunk,
        metadata: {
          uploaded_at: new Date().toISOString(),
          size: attachment.data?.length || 0
        }
      }));

      const saved = await this.supabaseService.saveUserKnowledgeChunks(rows);
      if (saved > 0) {
        ingestedChunks += saved;
        ingestedFiles += 1;
      }
    }

    return { ingestedChunks, ingestedFiles };
  }

  async getContextForQuery(userId, query, topK = 4) {
    if (!userId || !query) {
      return { chunks: [], sources: [] };
    }

    const rows = await this.supabaseService.getUserKnowledgeChunks(userId, 300);
    if (!rows || rows.length === 0) {
      return { chunks: [], sources: [] };
    }

    const normalizedQuery = this.normalizeQuery(query);
    const queryTokens = this.tokenize(normalizedQuery);
    const ranked = rows
      .map((row) => ({
        row,
        score: this.scoreChunk(queryTokens, row.chunk_text),
        createdAt: new Date(row.created_at || 0).getTime()
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => (b.score - a.score) || (b.createdAt - a.createdAt))
      .slice(0, topK);

    const latestSource = rows
      .map((row) => ({
        source: row.source_name || 'document utilisateur',
        createdAt: new Date(row.created_at || 0).getTime()
      }))
      .sort((a, b) => b.createdAt - a.createdAt)[0]?.source;

    // Si aucun match lexical strict, on privilégie le dernier document uploadé
    // pour répondre avec un contexte plus cohérent.
    const selected = ranked.length > 0
      ? ranked
      : rows
          .filter((row) => (row.source_name || 'document utilisateur') === latestSource)
          .sort((a, b) => (a.chunk_index || 0) - (b.chunk_index || 0))
          .slice(0, topK)
          .map((row) => ({
            row,
            score: 0,
            createdAt: new Date(row.created_at || 0).getTime()
          }));

    const chunks = selected.map((item) => ({
      content: item.row.chunk_text,
      metadata: {
        source: item.row.source_name || 'document utilisateur',
        sourceType: item.row.source_type || 'text/plain'
      }
    }));

    const sources = [...new Set(selected.map((item) => item.row.source_name || 'document utilisateur'))]
      .map((name) => ({
        title: `Document utilisateur: ${name}`
      }));

    return { chunks, sources };
  }
}

module.exports = UserKnowledgeService;
