const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const RetrievalService = require('./rag/retrieval-service');
const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const path = require('path');

class AIService {
  constructor() {
    this.openai = null;
    this.gemini = null;
    this.retrievalService = new RetrievalService();
    this.generatedImageDir = path.join(__dirname, '../public/generated');
    if (!fs.existsSync(this.generatedImageDir)) {
      fs.mkdirSync(this.generatedImageDir, { recursive: true });
    }
    this.initializeProviders();
  }

  initializeProviders() {
    // Initialiser OpenAI
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        this.openai = new OpenAI({
          apiKey: openaiKey,
        });
        console.log('✅ OpenAI initialisé avec succès');
      } catch (error) {
        console.error('❌ Erreur initialisation OpenAI:', error);
        this.openai = null;
      }
    } else {
      console.log('⚠️ OPENAI_API_KEY non définie');
    }

    // Initialiser Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        this.gemini = new GoogleGenerativeAI(geminiKey);
        console.log('✅ Gemini initialisé avec succès');
      } catch (error) {
        console.error('❌ Erreur initialisation Gemini:', error);
        this.gemini = null;
      }
    } else {
      console.log('⚠️ GEMINI_API_KEY non définie');
    }

    if (!this.openai && !this.gemini) {
      console.log('⚠️ Aucun provider IA disponible - Mode fallback activé');
    }

    // Initialiser le service de RAG en arrière-plan
    this.retrievalService.initialize().catch((err) => {
      console.error('Erreur initialisation retrieval service:', err);
    });
  }

  async getDevOpsResponse(message, context = {}) {
    try {
      const provider = context.provider || 'openai';
      const normalizedQuestion = this.normalizeUserQuestion(message);
      const attachments = Array.isArray(context.attachments) ? context.attachments : [];
      const hasImageAttachment = attachments.some((a) => a?.type && String(a.type).startsWith('image/'));

      if (this.isImageGenerationRequest(normalizedQuestion)) {
        return await this.generateIllustrationResponse(normalizedQuestion);
      }

      let systemPrompt = this.buildDevOps_prompt(context);
      let ragChunks = [];
      let ragSources = [];
      const grounding = context.knowledgeContext || { contextText: '', sources: [] };
      const userKnowledgeContext = context.userKnowledgeContext || { chunks: [], sources: [] };
      if (grounding.contextText) {
        systemPrompt += `\n\nContexte de sources fiables externes:\n${grounding.contextText}`;
      }

      // Ajouter le contexte documentaire RAG si disponible
      let ragContext = '';
      if (this.retrievalService && this.retrievalService.enabled) {
        ragChunks = await this.retrievalService.retrieveRelevantChunks(
          this.buildRetrievalQuery(normalizedQuestion),
          Number(process.env.RAG_RETRIEVAL_TOP_K || 16)
        );
        if (ragChunks.length > 0) {
          ragSources = [...new Set(ragChunks.map((c) => c.metadata.source || 'cours'))];
          const formatted = ragChunks
            .map((c, idx) => `Source ${idx + 1} (${c.metadata.source || 'cours'}):\n${c.content}`)
            .join('\n\n---\n\n');

          ragContext = `\n\nContexte documentaire issu de cours DevOps :\n${formatted}\n\nInstructions obligatoires pour la réponse:\n- Base ta réponse sur ce contexte documentaire en priorité.\n- Si une information n'est pas présente, dis explicitement \"Non couvert par les documents fournis\".\n- Termine toujours par une section \"Sources utilisees\" avec les noms de fichiers utilises.\n- Sources candidates: ${ragSources.join(', ')}.`;
          systemPrompt += ragContext;
          console.log('RAG: chunks récupérés =', ragChunks.length, 'sources =', ragSources.join(', '));
        } else {
          console.log('RAG: aucun chunk pertinent trouvé pour la question');
        }
      }

      // Ajouter les connaissances personnalisées issues des documents uploadés.
      if (Array.isArray(userKnowledgeContext.chunks) && userKnowledgeContext.chunks.length > 0) {
        ragChunks = [...userKnowledgeContext.chunks, ...ragChunks];
      }

      // Mode local RAG: répond sans clé API, directement depuis les extraits.
      if (context.preferLocalRag === true || provider === 'local-rag') {
        if (!ragChunks || ragChunks.length === 0) {
          const fallback = `📚 Mode local RAG actif, mais aucun document pertinent n'a été trouvé (ou le moteur RAG est indisponible). ${this.getFallbackResponse(normalizedQuestion)}`;
          return this.appendSources(fallback, grounding.sources);
        }
        return this.buildLocalRagResponse(normalizedQuestion, ragChunks, grounding.sources);
      }

      // Utiliser le provider spécifié ou OpenAI par défaut
      if (provider === 'gemini' && this.gemini) {
        return await this.getGeminiResponse(message, systemPrompt, attachments);
      } else if (provider === 'openai' && this.openai) {
        if (hasImageAttachment && this.gemini) {
          return await this.getGeminiResponse(message, systemPrompt, attachments);
        }
        if (hasImageAttachment && !this.gemini) {
          return 'Je ne peux pas analyser cette image avec la configuration actuelle. Activez Gemini (vision) ou reformulez sans image.';
        }
        return await this.getOpenAIResponse(message, systemPrompt);
      } else if (this.openai) {
        // Fallback à OpenAI si le provider spécifié n'est pas disponible
        return await this.getOpenAIResponse(message, systemPrompt);
      } else if (this.gemini) {
        // Fallback à Gemini si OpenAI n'est pas disponible
        return await this.getGeminiResponse(message, systemPrompt, attachments);
      } else {
        console.log('Aucun provider IA disponible, utilisation du fallback');
        return ragChunks.length > 0
          ? this.buildLocalRagResponse(normalizedQuestion, ragChunks, grounding.sources)
          : this.appendSources(this.getFallbackResponse(normalizedQuestion), grounding.sources);
      }
    } catch (error) {
      console.error('Erreur IA:', error);
      // Si OpenAI échoue (ex: invalid_api_key), tenter Gemini si disponible.
      if (this.gemini) {
        try {
          const prompt = this.buildDevOps_prompt(context);
          return await this.getGeminiResponse(message, prompt, context.attachments || []);
        } catch (geminiError) {
          console.error('Fallback Gemini échoué:', geminiError);
        }
      }
      return this.appendSources(this.getFallbackResponse(message), context.knowledgeContext?.sources || []);
    }
  }

  async getOpenAIResponse(message, systemPrompt) {
    const completion = await this.openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: message
        }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    return completion.choices[0].message.content;
  }

  async extractAttachmentText(attachment) {
    try {
      if (!attachment || !attachment.data || !attachment.type) return '';
      const base64 = attachment.data.split(',').pop();
      const raw = Buffer.from(base64, 'base64');
      const mime = attachment.type.toLowerCase();

      if (mime.includes('pdf')) {
        const parser = new PDFParse({ data: raw });
        try {
          const parsed = await parser.getText();
          return parsed.text ? parsed.text.slice(0, 7000) : '';
        } finally {
          await parser.destroy();
        }
      }

      if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml')) {
        return raw.toString('utf-8').slice(0, 7000);
      }

      return '';
    } catch (error) {
      console.warn('Impossible d’extraire le texte de la pièce jointe:', attachment?.name, error.message);
      return '';
    }
  }

  async getGeminiResponse(message, systemPrompt, attachments = []) {
    const model = this.gemini.getGenerativeModel({ model: "gemini-2.5-flash" });

    const parts = [{ text: `${systemPrompt}\n\nUtilisateur: ${message}` }];

    for (const attachment of attachments.slice(0, 4)) {
      if (!attachment || !attachment.data || !attachment.type) continue;
      if (attachment.type.startsWith('image/')) {
        const imageBase64 = attachment.data.split(',').pop();
        parts.push({
          inlineData: {
            mimeType: attachment.type,
            data: imageBase64,
          },
        });
      } else {
        const extracted = await this.extractAttachmentText(attachment);
        if (extracted) {
          parts.push({
            text: `\n\nContenu du fichier joint "${attachment.name}":\n${extracted}`,
          });
        }
      }
    }

    const result = await model.generateContent(parts);
    const response = await result.response;
    
    return response.text();
  }

  isImageGenerationRequest(message = '') {
    const lower = message.toLowerCase();
    return /(genere|génère|cree|crée|illustr|dessin|image)/.test(lower) && /(image|illustration|visuel|schema|schéma)/.test(lower);
  }

  async generateIllustrationResponse(message) {
    if (!this.openai) {
      return "Je ne peux pas générer d'image pour le moment (OPENAI_API_KEY manquante). Reformulez en texte ou activez OpenAI.";
    }
    try {
      const prompt = `Crée une illustration pédagogique DevOps, style clair, moderne, lisible. Demande utilisateur: ${message}`;
      const result = await this.openai.images.generate({
        model: 'gpt-image-1',
        prompt,
        size: '1024x1024'
      });
      const b64 = result?.data?.[0]?.b64_json;
      if (!b64) {
        return "Je n'ai pas pu générer l'illustration cette fois. Réessayez avec une description plus précise.";
      }
      const fileName = `illustration-${Date.now()}.png`;
      const filePath = path.join(this.generatedImageDir, fileName);
      fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
      return `Illustration générée avec succès.\nOuvrir: /generated/${fileName}`;
    } catch (error) {
      return `Je n'ai pas pu générer l'image: ${error.message}`;
    }
  }

  appendSources(answer, externalSources = []) {
    if (!externalSources || externalSources.length === 0) {
      return answer;
    }

    const sourceLines = externalSources
      .map((source) => `- ${source.title}: ${source.url}`)
      .join('\n');

    if (answer.includes('Sources utilisees')) {
      return `${answer}\n${sourceLines}`;
    }

    return `${answer}\n\nSources utilisees:\n${sourceLines}`;
  }

  tokenize(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2);
  }

  normalizeUserQuestion(text) {
    let cleaned = (text || '').trim();
    const replacements = [
      [/defisni/gi, 'definis'],
      [/defisnir/gi, 'definir'],
      [/contenerisation/gi, 'conteneurisation'],
      [/contenurisation/gi, 'conteneurisation'],
      [/dev ops/gi, 'devops'],
      [/\s+/g, ' '],
    ];

    for (const [pattern, replacement] of replacements) {
      cleaned = cleaned.replace(pattern, replacement);
    }
    return cleaned;
  }

  buildRetrievalQuery(question) {
    const q = (question || '').toLowerCase();
    if (q.includes('conteneurisation') || q.includes('docker')) {
      return `${question} docker image container dockerfile build run registry`;
    }
    if (q.includes('ci') || q.includes('cd') || q.includes('pipeline')) {
      return `${question} integration continue deploiement continu pipeline build test release`;
    }
    if (q.includes('monitoring') || q.includes('metrique') || q.includes('métrique')) {
      return `${question} monitoring metriques observabilite alerting logs prometheus grafana`;
    }
    if (q.includes('devops')) {
      return `${question} culture devops collaboration automation feedback ci cd`;
    }
    return question;
  }

  detectIntent(question) {
    const q = (question || '').toLowerCase();
    if (q.includes('conteneurisation') || q.includes('docker')) return 'containerization';
    if (q.includes('ci') || q.includes('cd') || q.includes('pipeline')) return 'cicd';
    if (q.includes('monitoring') || q.includes('metrique') || q.includes('métrique')) return 'monitoring';
    if (q.includes('devops')) return 'devops';
    return 'generic';
  }

  buildIntentFallback(intent) {
    switch (intent) {
      case 'containerization':
        return 'La conteneurisation consiste à empaqueter une application avec ses dépendances dans une image exécutable. Étapes clés: créer un Dockerfile, builder l’image, lancer le container puis publier l’image dans un registry.';
      case 'cicd':
        return 'Le CI/CD automatise build, tests et déploiement. Flux classique: commit -> pipeline CI (build+tests) -> validation -> CD vers staging/production.';
      case 'monitoring':
        return 'Le monitoring suit la santé et la performance (latence, erreurs, saturation). On combine métriques, logs et alertes pour agir rapidement.';
      case 'devops':
        return 'DevOps rapproche Dev et Ops pour livrer plus vite et de manière fiable via automatisation, collaboration et amélioration continue.';
      default:
        return this.getFallbackResponse('');
    }
  }

  cleanChunkText(text) {
    return (text || '')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, ' ')
      .replace(/\b\d{1,4}\(\d{1,4}\)\b/g, ' ')
      .replace(/[\u2022\u25cf\u25a0]/g, ' ')
      .replace(/\s*[:;,-]\s*$/g, '')
      .replace(/[._]{3,}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  extractRelevantSentences(query, ragChunks, limit = 4) {
    const queryTokens = this.tokenize(query);
    const scored = [];

    for (const chunk of ragChunks || []) {
      const source = chunk?.metadata?.source || 'document';
      const cleaned = this.cleanChunkText(chunk?.content || '');
      const sentences = cleaned
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 50 && s.length <= 240)
        .filter((s) => this.isSentenceUsable(s));

      for (const sentence of sentences) {
        const tokens = new Set(this.tokenize(sentence));
        let score = 0;
        for (const token of queryTokens) {
          if (tokens.has(token)) score += 1;
        }
        if (score > 0) {
          scored.push({ sentence, source, score });
        }
      }
    }

    const dedup = [];
    const seen = new Set();
    for (const item of scored.sort((a, b) => b.score - a.score)) {
      const key = item.sentence.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        dedup.push(item);
      }
      if (dedup.length >= limit) break;
    }
    return dedup;
  }

  isSentenceUsable(sentence) {
    const text = String(sentence || '').trim();
    if (!text) return false;

    // Écarte les extraits de table des matières, références brutes, et lignes fragmentées.
    if (/^\d+[:.)-]/.test(text)) return false;
    if (/(copyright|all rights reserved|isbn|table of contents)/i.test(text)) return false;
    if (/[|]{2,}/.test(text)) return false;

    const letters = (text.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
    const digits = (text.match(/\d/g) || []).length;
    const alphaRatio = letters / Math.max(1, text.length);
    const digitRatio = digits / Math.max(1, text.length);

    if (alphaRatio < 0.55) return false;
    if (digitRatio > 0.18) return false;

    // Une phrase utile doit contenir au moins un verbe/fréquence de langage.
    if (!/(est|sont|permet|utilise|automati|deploi|livraison|monitor|pipeline|collaboration|culture|tests?)/i.test(text)) {
      return false;
    }
    return true;
  }

  buildIntentAnswer(intent, message) {
    switch (intent) {
      case 'containerization':
        return 'La conteneurisation permet d’exécuter une application de façon reproductible avec ses dépendances. Commencez par un Dockerfile minimal, testez en local, puis déployez via une pipeline CI/CD.';
      case 'cicd':
        return 'Le CI/CD automatise build, tests et déploiement pour réduire les erreurs manuelles. Le flux recommandé est: commit, tests automatiques, validation, puis déploiement progressif.';
      case 'monitoring':
        return 'Le monitoring fiable combine métriques, logs et alertes. Surveillez en priorité la latence, le taux d’erreur et la saturation CPU/mémoire/disque.';
      case 'devops':
        return 'La culture DevOps repose sur la collaboration entre Dev et Ops, l’automatisation des livraisons et l’amélioration continue basée sur le feedback terrain.';
      default:
        return `Voici une réponse basée sur vos documents pour "${message}".`;
    }
  }

  buildLocalRagResponse(message, ragChunks = [], externalSources = []) {
    if (!ragChunks || ragChunks.length === 0) {
      return this.appendSources(
        'Je suis en mode local (RAG) mais je n’ai trouvé aucun passage pertinent dans les documents. Reformule la question avec des mots DevOps plus précis (ex: CI/CD, Docker, pipeline, monitoring).',
        externalSources
      );
    }

    const lower = (message || '').toLowerCase().trim();
    if (['bonjour', 'salut', 'hello', 'bonsoir'].includes(lower)) {
      const greet = 'Bonjour 👋 Je suis prêt à vous aider sur le DevOps (CI/CD, Docker, monitoring, Kubernetes, troubleshooting). Posez-moi votre question précise.';
      return this.appendSources(greet, externalSources);
    }

    const relevant = this.extractRelevantSentences(message, ragChunks, 5);
    const intent = this.detectIntent(message);
    if (relevant.length === 0) {
      const fallback = this.buildIntentFallback(intent);
      return this.appendSources(`Je n'ai pas trouvé de passage suffisamment clair dans les documents pour cette question. ${fallback}`, externalSources);
    }

    const bulletPoints = relevant
      .map((item, idx) => `- Point ${idx + 1}: ${item.sentence.replace(/\s+/g, ' ').trim()}`)
      .join('\n');
    const sources = [...new Set(relevant.map((item) => item.source))].join(', ');

    const intentLabel = intent === 'containerization'
      ? 'Conteneurisation'
      : intent === 'cicd'
        ? 'CI/CD'
        : intent === 'monitoring'
          ? 'Monitoring'
          : intent === 'devops'
            ? 'Culture DevOps'
            : 'Synthèse';

    const coreAnswer = this.buildIntentAnswer(intent, message);
    const ragAnswer = `${intentLabel}:\n${coreAnswer}\n\nÉléments pertinents extraits des documents:\n${bulletPoints}\n\nSources utilisees:\n- ${sources}`;
    return this.appendSources(ragAnswer, externalSources);
  }

  buildDevOps_prompt(context) {
    return `Tu es un assistant DevOps expert nommé "DevOps Assistant Bot". 
Ta spécialité : aider les développeurs avec les déploiements, le monitoring, l'optimisation et le diagnostic.

Compétences principales :
- 🚀 Déploiement d'applications (Docker, Kubernetes, CI/CD)
- 📊 Monitoring et métriques (Prometheus, Grafana)
- 🔍 Diagnostic d'erreurs et logs
- ⚡ Optimisation des performances
- 🔧 Gestion de l'infrastructure cloud (AWS, Azure, GCP)
- 🛡️ Sécurité et bonnes pratiques

Style de communication :
- Professionnel mais accessible
- Réponses concises et actionnables
- Utilise des émojis pertinents
- Donne des exemples concrets quand possible
- Pose des questions de clarification si nécessaire

Contexte actuel : ${JSON.stringify(context)}

Réponds toujours en français et de manière helpful.`;
  }

  getFallbackResponse(message) {
    const lowerMessage = (message || '').toLowerCase();

    if (
      lowerMessage.includes('defini ci') ||
      lowerMessage.includes('défini ci') ||
      lowerMessage.includes('c est quoi ci') ||
      lowerMessage.includes("c'est quoi ci")
    ) {
      return 'CI signifie Intégration Continue. C’est une pratique où chaque changement de code est automatiquement testé et validé via un pipeline (build + tests + qualité) pour détecter les erreurs tôt.';
    }

    if (
      lowerMessage.includes('defini devops') ||
      lowerMessage.includes('définis devops') ||
      lowerMessage.includes('c est quoi devops') ||
      lowerMessage.includes("c'est quoi devops")
    ) {
      return 'DevOps est une approche qui rapproche Développement (Dev) et Exploitation (Ops) pour livrer plus vite et de manière fiable grâce à l’automatisation (CI/CD), au monitoring, et à des boucles d’amélioration continue.';
    }

    if (lowerMessage.includes('deploy')) {
      return 'Je peux vous aider avec le déploiement ! Quel type d\'application voulez-vous déployer ? Docker, Kubernetes, ou plateforme cloud ?';
    }
    if (lowerMessage.includes('monitor')) {
      return 'Voici l\'état actuel du système : CPU: 45%, Mémoire: 62%, Disque: 78%. Que souhaitez-vous monitorer spécifiquement ?';
    }
    if (lowerMessage.includes('error') || lowerMessage.includes('erreur')) {
      return 'Je détecte une demande d\'aide pour les erreurs. Pouvez-vous me donner plus de détails sur le problème rencontré ?';
    }
    if (lowerMessage.includes('optim')) {
      return 'Pour l\'optimisation, je peux analyser les performances de votre application. Quels aspects souhaitez-vous améliorer ?';
    }

    return "Je ne connais pas encore une réponse fiable à cette question. Reformulez avec plus de contexte (outil, erreur, objectif) et je vous aiderai.";
  }

  async analyzeSystemMetrics(metrics) {
    const prompt = `Analyse ces métriques système et donne des recommandations :
CPU: ${metrics.cpu}%
Mémoire: ${metrics.memory}%
Disque: ${metrics.disk}%

Identifie les problèmes potentiels et suggère des actions correctives.`;

    return await this.getDevOpsResponse(prompt, { metrics });
  }

  async suggestDeploymentSteps(appType, platform) {
    const prompt = `Je veux déployer une application ${appType} sur ${platform}. 
Donne-moi les étapes spécifiques et les bonnes pratiques à suivre.`;

    return await this.getDevOpsResponse(prompt, { appType, platform });
  }
}

module.exports = AIService;
