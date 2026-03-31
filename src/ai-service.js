const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const RetrievalService = require('./rag/retrieval-service');

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

      // Ajouter le contexte documentaire RAG si disponible
      let ragContext = '';
      if (this.retrievalService && this.retrievalService.enabled) {
        const chunks = await this.retrievalService.retrieveRelevantChunks(message, 4);
        if (chunks.length > 0) {
          const uniqueSources = [...new Set(chunks.map((c) => c.metadata.source || 'cours'))];
          const formatted = chunks
            .map((c, idx) => `Source ${idx + 1} (${c.metadata.source || 'cours'}):\n${c.content}`)
            .join('\n\n---\n\n');

          ragContext = `\n\nContexte documentaire issu de cours DevOps :\n${formatted}\n\nInstructions obligatoires pour la réponse:\n- Base ta réponse sur ce contexte documentaire en priorité.\n- Si une information n'est pas présente, dis explicitement \"Non couvert par les documents fournis\".\n- Termine toujours par une section \"Sources utilisees\" avec les noms de fichiers utilises.\n- Sources candidates: ${uniqueSources.join(', ')}.`;
          systemPrompt += ragContext;
          console.log('RAG: chunks récupérés =', chunks.length, 'sources =', uniqueSources.join(', '));
        } else {
          console.log('RAG: aucun chunk pertinent trouvé pour la question');
        }
      }

      // Utiliser le provider spécifié ou OpenAI par défaut
      if (provider === 'gemini' && this.gemini) {
        return await this.getGeminiResponse(message, systemPrompt);
      } else if (provider === 'openai' && this.openai) {
        return await this.getOpenAIResponse(message, systemPrompt);
      } else if (this.openai) {
        // Fallback à OpenAI si le provider spécifié n'est pas disponible
        return await this.getOpenAIResponse(message, systemPrompt);
      } else if (this.gemini) {
        // Fallback à Gemini si OpenAI n'est pas disponible
        return await this.getGeminiResponse(message, systemPrompt);
      } else {
        console.log('Aucun provider IA disponible, utilisation du fallback');
        return this.getFallbackResponse(message);
      }
    } catch (error) {
      console.error('Erreur IA:', error);
      // Si OpenAI échoue (ex: invalid_api_key), tenter Gemini si disponible.
      if (this.gemini) {
        try {
          const prompt = this.buildDevOps_prompt(context);
          return await this.getGeminiResponse(message, prompt);
        } catch (geminiError) {
          console.error('Fallback Gemini échoué:', geminiError);
        }
      }
      return this.getFallbackResponse(message);
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

  async getGeminiResponse(message, systemPrompt) {
    const model = this.gemini.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    // Combiner le system prompt et le message pour Gemini
    const fullPrompt = `${systemPrompt}\n\nUtilisateur: ${message}`;
    
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    
    return response.text();
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

    const lowerMessage = message.toLowerCase();
    
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
