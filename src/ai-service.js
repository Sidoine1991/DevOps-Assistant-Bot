const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const RetrievalService = require('./rag/retrieval-service');
const { PDFParse } = require('pdf-parse');

class AIService {
  constructor() {
    this.openai = null;
    this.gemini = null;
    this.retrievalService = new RetrievalService();
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
        ragChunks = await this.retrievalService.retrieveRelevantChunks(message, 4);
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
          const fallback = `📚 Mode local RAG actif, mais aucun document pertinent n'a été trouvé (ou le moteur RAG est indisponible). ${this.getFallbackResponse(message)}`;
          return this.appendSources(fallback, grounding.sources);
        }
        return this.buildLocalRagResponse(message, ragChunks, grounding.sources);
      }

      // Utiliser le provider spécifié ou OpenAI par défaut
      if (provider === 'gemini' && this.gemini) {
        return await this.getGeminiResponse(message, systemPrompt, context.attachments || []);
      } else if (provider === 'openai' && this.openai) {
        return await this.getOpenAIResponse(message, systemPrompt);
      } else if (this.openai) {
        // Fallback à OpenAI si le provider spécifié n'est pas disponible
        return await this.getOpenAIResponse(message, systemPrompt);
      } else if (this.gemini) {
        // Fallback à Gemini si OpenAI n'est pas disponible
        return await this.getGeminiResponse(message, systemPrompt, context.attachments || []);
      } else {
        console.log('Aucun provider IA disponible, utilisation du fallback');
        return ragChunks.length > 0
          ? this.buildLocalRagResponse(message, ragChunks, grounding.sources)
          : this.appendSources(this.getFallbackResponse(message), grounding.sources);
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

  buildLocalRagResponse(message, ragChunks = [], externalSources = []) {
    if (!ragChunks || ragChunks.length === 0) {
      return this.appendSources(
        'Je suis en mode local (RAG) mais je n’ai trouvé aucun passage pertinent dans les documents. Reformule la question avec des mots DevOps plus précis (ex: CI/CD, Docker, pipeline, monitoring).',
        externalSources
      );
    }

    const top = ragChunks.slice(0, 3);
    const bulletPoints = top
      .map((chunk, idx) => `- Point ${idx + 1}: ${chunk.content.slice(0, 260).replace(/\s+/g, ' ')}...`)
      .join('\n');
    const sources = [...new Set(top.map((c) => c.metadata?.source || 'cours'))].join(', ');

    const ragAnswer = `Voici une réponse fondée sur vos documents RAG pour: "${message}"\n\n${bulletPoints}\n\nSources utilisees:\n- ${sources}`;
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
    const fallbackResponses = {
      'deploy': 'Je peux vous aider avec le déploiement ! Quel type d\'application voulez-vous déployer ? Docker, Kubernetes, ou plateforme cloud ?',
      'monitor': 'Voici l\'état actuel du système : CPU: 45%, Mémoire: 62%, Disque: 78%. Que souhaitez-vous monitorer spécifiquement ?',
      'error': 'Je détecte une demande d\'aide pour les erreurs. Pouvez-vous me donner plus de détails sur le problème rencontré ?',
      'optim': 'Pour l\'optimisation, je peux analyser les performances de votre application. Quels aspects souhaitez-vous améliorer ?',
      'default': 'Je suis votre assistant DevOps ! Je peux vous aider avec les déploiements, monitoring, erreurs et optimisation. Comment puis-je vous aider ?'
    };

    const lowerMessage = (message || '').toLowerCase();
    
    for (const [key, response] of Object.entries(fallbackResponses)) {
      if (lowerMessage.includes(key)) {
        return response;
      }
    }
    
    return fallbackResponses.default;
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
