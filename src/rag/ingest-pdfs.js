const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const { ChromaClient } = require('chromadb');
const { DefaultEmbeddingFunction } = require('@chroma-core/default-embed');
const { parseChromaConnection, formatChromaConnectionSummary } = require('./chroma-client-url');

require('dotenv').config();

const DATA_DIR = process.env.RAG_DATA_DIR || path.join(process.cwd(), 'data_course');
const CHROMA_COLLECTION = process.env.RAG_COLLECTION || 'devops_courses';
const CHROMA_PERSIST_DIR = process.env.RAG_CHROMA_DIR || path.join(__dirname, '../../chroma_db');
const MAX_CHUNKS_PER_DOC = Number(process.env.RAG_MAX_CHUNKS_PER_DOC || 1200);
const RAG_INGEST_BATCH_SIZE = Number(process.env.RAG_INGEST_BATCH_SIZE || 16);
const RAG_CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE || 1200);
const RAG_CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP || 150);
const CHROMA_HOST = process.env.CHROMA_HOST || '127.0.0.1';
const CHROMA_PORT = Number(process.env.CHROMA_PORT || 8000);
const CHROMA_SSL = process.env.CHROMA_SSL === 'true';
const CHROMA_URL = process.env.CHROMA_URL || '';
const RAG_INGEST_REPLACE = process.env.RAG_INGEST_REPLACE === 'true';
const RAG_INGEST_BATCH_PAUSE_MS = Number(process.env.RAG_INGEST_BATCH_PAUSE_MS || 0);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function addChromaBatchWithRetries(collection, batch, maxRetries = 8) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await collection.add(batch);
      return;
    } catch (error) {
      const msg = error && error.message ? error.message : String(error);
      const transient =
        /Failed to connect|ChromaConnectionError|ECONNREFUSED|ETIMEDOUT|timeout|429|502|503|504|fetch failed/i.test(
          msg
        );
      if (transient && attempt < maxRetries) {
        const delay = Math.min(30000, 2000 * (attempt + 1));
        console.warn(
          `⚠️ Chroma indisponible (tentative ${attempt + 1}/${maxRetries}), nouvel essai dans ${delay} ms...`
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
}

function chunkText(text, chunkSize = RAG_CHUNK_SIZE, overlap = RAG_CHUNK_OVERLAP) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end);
    chunks.push(chunk.trim());
    if (end === text.length) break;
    start = end - overlap;
  }
  return chunks.filter(c => c.length > 0);
}

async function loadPdfFiles(dir) {
  const files = await fs.promises.readdir(dir);
  return files
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(dir, f));
}

async function extractTextFromPdf(filePath) {
  const dataBuffer = await fs.promises.readFile(filePath);
  const parser = new PDFParse({ data: dataBuffer });
  try {
    const data = await parser.getText();
    return data.text || '';
  } finally {
    await parser.destroy();
  }
}

function getEmbeddingFunction() {
  // Embeddings locaux (pas de quota externe), idéal pour backup/offline.
  // Le modèle est téléchargé/chargé via transformers au premier run.
  return new DefaultEmbeddingFunction();
}

async function main() {
  console.log('🚀 Ingestion RAG démarrée');
  console.log('Dossier PDF:', DATA_DIR);

  if (!fs.existsSync(DATA_DIR)) {
    console.error('❌ Dossier de données introuvable:', DATA_DIR);
    process.exit(1);
  }

  const pdfFiles = await loadPdfFiles(DATA_DIR);
  if (pdfFiles.length === 0) {
    console.warn('⚠️ Aucun PDF trouvé dans', DATA_DIR);
    process.exit(0);
  }

  console.log(`📄 ${pdfFiles.length} PDF trouvés`);

  const chromaArgs = parseChromaConnection({
    chromaUrl: CHROMA_URL,
    chromaHost: CHROMA_HOST,
    chromaPort: CHROMA_PORT,
    chromaSsl: CHROMA_SSL,
  });
  console.log('Endpoint Chroma:', formatChromaConnectionSummary(chromaArgs));
  const embeddingFunction = getEmbeddingFunction();
  const client = new ChromaClient(chromaArgs);

  if (RAG_INGEST_REPLACE) {
    try {
      await client.deleteCollection({ name: CHROMA_COLLECTION });
      console.log(`🗑️ Collection "${CHROMA_COLLECTION}" supprimée (remplacement complet).`);
    } catch (e) {
      console.log('ℹ️ Pas de collection à supprimer ou erreur ignorée:', (e && e.message) || e);
    }
  }

  // Assurer la collection
  let collection;
  try {
    collection = await client.getCollection({ name: CHROMA_COLLECTION, embeddingFunction });
  } catch {
    collection = await client.createCollection({ name: CHROMA_COLLECTION, embeddingFunction });
  }

  let globalIndex = 0;

  for (const filePath of pdfFiles) {
    console.log('🔍 Traitement du fichier:', filePath);
    const rawText = await extractTextFromPdf(filePath);
    let chunks = chunkText(rawText);
    if (chunks.length > MAX_CHUNKS_PER_DOC) {
      chunks = chunks.slice(0, MAX_CHUNKS_PER_DOC);
      console.log(`⚠️ Limitation à ${MAX_CHUNKS_PER_DOC} chunks pour ${path.basename(filePath)} (configure RAG_MAX_CHUNKS_PER_DOC si besoin)`);
    }

    console.log(`➡️ ${chunks.length} chunks générés pour ${path.basename(filePath)}`);

    const ids = [];
    const metadatas = [];
    const documents = [];

    for (let i = 0; i < chunks.length; i++) {
      const id = `doc_${globalIndex}`;
      ids.push(id);
      documents.push(chunks[i]);
      metadatas.push({
        source: path.basename(filePath),
        index: i,
      });
      globalIndex++;
    }

    let batchSize = Math.max(1, RAG_INGEST_BATCH_SIZE);
    for (let start = 0; start < ids.length;) {
      const end = Math.min(start + batchSize, ids.length);
      try {
        await addChromaBatchWithRetries(collection, {
          ids: ids.slice(start, end),
          documents: documents.slice(start, end),
          metadatas: metadatas.slice(start, end),
        });
        start = end;
        if (RAG_INGEST_BATCH_PAUSE_MS > 0) {
          await sleep(RAG_INGEST_BATCH_PAUSE_MS);
        }
      } catch (error) {
        const msg = error && error.message ? error.message : String(error);
        const isMemoryIssue = /bad allocation|allocate memory|out of memory/i.test(msg);
        if (isMemoryIssue && batchSize > 1) {
          batchSize = Math.max(1, Math.floor(batchSize / 2));
          console.warn(`⚠️ Mémoire insuffisante, réduction du batch à ${batchSize}`);
          continue;
        }
        throw error;
      }
    }

    console.log(`✅ Indexation terminée pour ${path.basename(filePath)}`);
  }

  console.log('🎉 Ingestion RAG terminée avec succès');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Erreur ingestion RAG:', err);
  if (/Failed to connect|ChromaConnectionError|ECONNREFUSED/i.test(String(err && err.message))) {
    console.error(
      '→ Vérifiez que Chroma tourne (local Docker ou service Render) et que CHROMA_URL / CHROMA_HOST+CHROMA_PORT pointent vers le bon hôte et port (sans /api/v1 dans l’URL).'
    );
  }
  process.exit(1);
});

