const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const { ChromaClient } = require('chromadb');

require('dotenv').config();

const DATA_DIR = process.env.RAG_DATA_DIR || 'D:/Dev/Projet_fil/data_course';
const CHROMA_COLLECTION = process.env.RAG_COLLECTION || 'devops_courses';
const CHROMA_PERSIST_DIR = process.env.RAG_CHROMA_DIR || path.join(__dirname, '../../chroma_db');
const MAX_CHUNKS_PER_DOC = Number(process.env.RAG_MAX_CHUNKS_PER_DOC || 120);

function chunkText(text, chunkSize = 1800, overlap = 250) {
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

async function getEmbeddingModel() {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    throw new Error('GEMINI_API_KEY manquante pour générer les embeddings');
  }
  const genAI = new GoogleGenerativeAI(geminiKey);
  return genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
}

async function embedTexts(model, texts) {
  const embeddings = [];
  for (const text of texts) {
    const result = await model.embedContent(text);
    embeddings.push(result.embedding.values);
  }
  return embeddings;
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

  const client = new ChromaClient({ path: 'http://localhost:8000' });

  // Assurer la collection
  let collection;
  try {
    collection = await client.getCollection({ name: CHROMA_COLLECTION });
  } catch {
    collection = await client.createCollection({ name: CHROMA_COLLECTION });
  }

  const model = await getEmbeddingModel();

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

    const embeddings = await embedTexts(model, chunks);

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

    await collection.add({
      ids,
      documents,
      metadatas,
      embeddings,
    });

    console.log(`✅ Indexation terminée pour ${path.basename(filePath)}`);
  }

  console.log('🎉 Ingestion RAG terminée avec succès');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Erreur ingestion RAG:', err);
  process.exit(1);
});

