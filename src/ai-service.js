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
    this.openai = null;
    this.gemini = null;

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
  }

  async getDevOpsResponse(message, context = {}) {
    try {
      await this.retrievalService.initialize();
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

      // Mode local RAG : uniquement extraits Chroma (+ docs utilisateur indexés). Aucun appel Gemini/OpenAI.
      if (context.preferLocalRag === true || provider === 'local-rag') {
        if (!ragChunks || ragChunks.length === 0) {
          const ragUp = this.retrievalService && this.retrievalService.enabled;
          if (this.isSmallTalk(normalizedQuestion)) {
            return this.appendSources(
              'Bonjour 👋 Je suis prêt à vous aider sur le DevOps (CI/CD, Docker, monitoring, Kubernetes, troubleshooting). Dites-moi votre objectif ou votre erreur.',
              []
            );
          }
          if (this.isBotMetaQuestion(normalizedQuestion)) {
            return this.appendSources(
              'Je suis **DevOps Assistant Bot**, un assistant conversationnel orienté pratiques DevOps (déploiement, CI/CD, infrastructure, monitoring). ' +
                'En mode corpus documentaire, je m’appuie sur les textes indexés dans Chroma lorsque des extraits correspondent à votre question.',
              []
            );
          }
          const chromaUrlRaw = (process.env.CHROMA_URL && String(process.env.CHROMA_URL).trim()) || '';
          const chromaLooksRemote =
            /^https:\/\//i.test(chromaUrlRaw) && !/127\.0\.0\.1|localhost/i.test(chromaUrlRaw);
          let chromaHostHint = chromaUrlRaw;
          try {
            chromaHostHint = new URL(chromaUrlRaw).hostname;
          } catch (_) {
            /* garder la chaîne brute */
          }
          const coll = process.env.RAG_COLLECTION || 'devops_courses';
          const hintNoChromaLocal =
            '📚 **Chroma / RAG indisponible sur ce serveur.** Sur Render (ou tout hébergeur distant), `127.0.0.1` ne pointe pas vers votre PC. ' +
            'Créez un service **Chroma** (Docker) séparé, définissez `CHROMA_URL=https://votre-chroma.onrender.com`, redéployez l’app, puis ingérez les PDF depuis votre machine : `CHROMA_URL=… npm run rag:ingest`. ' +
            'Pour des réponses **sans** corpus documentaire, choisissez **Gemini** ou **OpenAI** dans la page Configuration.';
          const hintNoChromaRemote =
            `📚 **Chroma ne répond pas** depuis ce bot alors qu’une URL distante est configurée (\`${chromaHostHint}\`). ` +
            'Vérifiez que le service Chroma est **démarré** sur Render (plan gratuit : réveillez-le), que le **déploiement** et le **health check** passent, et que la collection `' +
            coll +
            '` contient des données (`CHROMA_URL=… npm run rag:ingest` depuis votre machine). ' +
            'Pour des réponses sans corpus documentaire, choisissez **Gemini** ou **OpenAI** dans Configuration.';
          const hintNoChroma = chromaLooksRemote ? hintNoChromaRemote : hintNoChromaLocal;
          const hintEmpty =
            '📚 **RAG connecté** mais aucun extrait ne correspond à cette question (base vide ou requête trop vague). ' +
            'Vérifiez l’ingestion (`npm run rag:ingest` vers la même `CHROMA_URL` et collection `RAG_COLLECTION`), ou reformulez avec du contexte (outil, erreur, objectif).';

          const metricsExtra =
            /\bmétrique|\bmetrique|monitoring|métriques système|analyse les métriques|cpu\b|ram\b|mémoire\b/i.test(
              normalizedQuestion
            );

          if (ragUp) {
            const genericFb = "Je ne connais pas encore une réponse fiable";
            const fb = this.getFallbackResponse(normalizedQuestion);
            if (fb && !fb.startsWith(genericFb)) {
              let body =
                '📚 **Aucun extrait PDF pertinent pour cette formulation.**\n\n' +
                `${fb}\n\n` +
                '_Pour citer vos documents, précisez le contexte ou complétez l’ingestion._';
              if (metricsExtra) {
                body +=
                  '\n\n_**Note :** en mode corpus seul, je n’ai pas accès aux métriques réelles de votre machine. Pour une aide hors documents indexés, choisissez **OpenAI** ou **Gemini** dans Configuration._';
              }
              return this.appendSources(body, []);
            }
            const intent = this.detectIntent(normalizedQuestion);
            if (intent !== 'generic') {
              const quick = this.buildIntentAnswer(intent, normalizedQuestion);
              let body =
                '📚 **Aucun passage des documents indexés ne correspond assez à cette question** (corpus partiel, formulation ou similarité).\n\n' +
                `**Rappel utile (hors extraits PDF) :**\n${quick}\n\n` +
                '_Si vous attendez des citations depuis vos cours, reformulez avec des termes proches du contenu ou vérifiez l’ingestion (`npm run rag:ingest`)._';
              if (metricsExtra) {
                body +=
                  '\n\n_**Note :** en mode corpus seul, je n’ai pas accès aux métriques réelles de votre machine. Pour une aide générale hors PDF, choisissez **OpenAI** ou **Gemini** dans Configuration._';
              }
              return this.appendSources(body, []);
            }
          }

          // Chroma injoignable : réponses courtes DevOps quand même (éviter de bloquer sur le seul message « configurez CHROMA »).
          const noteHorsCorpus =
            '\n\n_Configuration → **Gemini** ou **OpenAI** pour des réponses sans index PDF, ou **CHROMA_URL** + `npm run rag:ingest` pour vos documents._';
          if (!ragUp) {
            const fb = this.getFallbackResponse(normalizedQuestion);
            const genericFb = "Je ne connais pas encore une réponse fiable";
            if (fb && !fb.startsWith(genericFb)) {
              return this.appendSources(fb + noteHorsCorpus, []);
            }
            const intent = this.detectIntent(normalizedQuestion);
            if (intent !== 'generic') {
              const quick = this.buildIntentAnswer(intent, normalizedQuestion);
              return this.appendSources(quick + noteHorsCorpus, []);
            }
          }

          let body = ragUp ? hintEmpty : hintNoChroma;
          if (metricsExtra) {
            body +=
              '\n\n_**Note :** en mode corpus documentaire seul, je n’ai pas accès aux métriques réelles de votre machine. Pour une aide hors documents indexés, choisissez **OpenAI** ou **Gemini** dans Configuration._';
          }
          return this.appendSources(body, []);
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
      if (context.preferLocalRag === true || context.provider === 'local-rag') {
        return this.appendSources(
          'Une erreur est survenue en mode RAG local. Vérifiez Chroma et les documents indexés, puis réessayez.',
          []
        );
      }
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
      [/conteunerisation/gi, 'conteneurisation'],
      [/conteuneurisation/gi, 'conteneurisation'],
      [/dev ops/gi, 'devops'],
      [/devosp/gi, 'devops'],
      [/kubernets/gi, 'kubernetes'],
      [/\s+/g, ' '],
    ];

    for (const [pattern, replacement] of replacements) {
      cleaned = cleaned.replace(pattern, replacement);
    }
    return cleaned;
  }

  isSmallTalk(message = '') {
    const raw = String(message || '').trim();
    if (!raw) return true;
    const lower = raw.toLowerCase();
    const q = this.stripAccents(lower).replace(/\s+/g, ' ').trim();
    if (q.length <= 2) return true;
    const smallTalk = new Set([
      'cc', 'coucou', 'salut', 'hello', 'hi', 'hey', 'bonjour', 'bonsoir',
      'yo', 'svp', 'stp', 'merci', 'ok', 'oki', 'test', 'bisous', 'a plus', 'au revoir',
    ]);
    if (smallTalk.has(q)) return true;
    if (/^(bonjour|bonsoir|salut|coucou|hello|hi)\b[!?.…\s]*$/i.test(q)) return true;
    if (/^comment\s+(ça|ca)\s+va\b/i.test(q) || /^comment\s+tu\s+vas\b/i.test(q)) return true;
    if (/^comment\s+allez[- ]vous\b/i.test(q) || /^ça\s+va\b/i.test(q) || /^ca\s+va\b/i.test(q)) return true;
    if (/^tu\s+vas\s+bien\b/i.test(q) || /^vous\s+allez\s+bien\b/i.test(q)) return true;
    return false;
  }

  stripAccents(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  isBotMetaQuestion(message = '') {
    const q = this.stripAccents(String(message || '').trim().toLowerCase())
      .replace(/['\u2019]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!q) return false;
    if (/qui\s+(t\s*a|vous\s+a|t\s+as)\s+(cree|creer|invente|develop|fait)/.test(q)) return true;
    if (/qui\s+a\s+(cree|creer|invente|develop)\s+(ce\s+)?(bot|assistant|toi)/.test(q)) return true;
    if (/c\s*est\s+qui\s+(le\s+)?(createur|auteur|developpeur|dev)/.test(q)) return true;
    if (/createur\s+du\s+bot/.test(q) || /qui\s+es[- ]tu\b/.test(q)) return true;
    if (/\bqu\s*est[- ]ce\s+que\s+tu\s+es\b/.test(q)) return true;
    const c = q.replace(/\s+/g, '');
    return (
      c.includes('quiestu') ||
      c.includes('quelesttonnom') ||
      (c.includes('questce') && c.includes('bot'))
    );
  }

  buildRetrievalQuery(question) {
    const q = this.stripAccents((question || '').toLowerCase());
    const containerTopic =
      q.includes('conteneurisation') ||
      q.includes('contenurisation') ||
      q.includes('conteunerisation') ||
      q.includes('containerisation') ||
      /\bconteneurs?\b/.test(q) ||
      q.includes('docker') ||
      q.includes('kubernetes') ||
      /\bk8s\b/.test(q) ||
      q.includes('dockerfile');
    const virtTopic =
      q.includes('virtualisation') ||
      q.includes('virtualization') ||
      q.includes('hyperviseur') ||
      q.includes('hypervisor') ||
      /\bvm\b/.test(q) ||
      q.includes('machine virtuelle');
    if (containerTopic || virtTopic) {
      let extra =
        'docker conteneurisation container virtualisation hyperviseur machine virtuelle kubernetes image';
      if (
        /comment\b|mettre en place|installer|autonome|application|etapes?|deploi|deploy|creer|construi|execut|demarr|lancer|dockerfile|isol/.test(
          q
        )
      ) {
        extra +=
          ' dockerfile docker build run docker-compose compose .dockerignore dependances port volume reseau environnement healthcheck registry image autonome isoler';
      }
      return `${question} ${extra}`;
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
    const q = this.stripAccents((question || '').toLowerCase());
    if (
      q.includes('conteneurisation') ||
      q.includes('contenurisation') ||
      q.includes('conteunerisation') ||
      /\bconteneurs?\b/.test(q) ||
      q.includes('docker') ||
      q.includes('kubernetes') ||
      /\bk8s\b/.test(q)
    ) {
      return 'containerization';
    }
    if (q.includes('virtualisation') || q.includes('hyperviseur') || /\bvm\b/.test(q)) {
      return 'containerization';
    }
    if (q.includes('ci') || q.includes('cd') || q.includes('pipeline')) return 'cicd';
    if (q.includes('monitoring') || q.includes('metrique')) return 'monitoring';
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
    const qNorm = this.stripAccents((query || '').toLowerCase());
    const dockerishQuery = /docker|dockerfile|conteneur|container|image docker|kubernetes|\bk8s\b/.test(qNorm);
    let queryTokens = this.tokenize(query);
    if (dockerishQuery) {
      const boost = [
        'docker',
        'dockerfile',
        'image',
        'conteneur',
        'container',
        'compose',
        'application',
        'dependances',
        'autonome',
        'build',
        'registry',
        'port',
        'volume',
      ];
      queryTokens = [...new Set([...queryTokens, ...boost])];
    }

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
        if (dockerishQuery && /docker|dockerfile|conteneur|container|\bimage\b|compose|registry|ecr|kubernetes|pod|build|scanning container/i.test(sentence)) {
          score += 3;
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

    // Une phrase utile : verbes courants OU vocabulaire technique (PDFs bilingues / listes à puces).
    const hasVerb = /(est|sont|permet|utilise|automati|deploi|livraison|monitor|pipeline|collaboration|culture|tests?|inclut|offre|definit|gere|partage)/i.test(
      text
    );
    const hasTech = /(conteneur|docker|kubernetes|k8s|virtualis|hyperviseur|vm\b|image|registry|namespace|cgroup|orchestr|microservice|cloud|aws|azure|gcp)/i.test(
      text
    );
    if (!hasVerb && !hasTech) return false;
    return true;
  }

  /** Question du type « comment mettre en place … sur Docker » (procédurale, pas seulement définition). */
  isDockerSetupQuestion(message = '') {
    const q = this.stripAccents((message || '').toLowerCase());
    const procedural =
      /comment\b|mettre en place|installer|deploi|deploy|creer|construi|execut|demarr|lancer|etapes?|comment faire|how to|^pour\b/.test(
        q
      );
    const dockerish = /docker|conteneur|dockerfile|image docker|\bimage\b.*docker|kubernetes|\bk8s\b/.test(q);
    return procedural && dockerish;
  }

  /** Réponse directe et structurée pour une mise en place Docker (cadre la question « comment »). */
  buildDockerSetupCoreAnswer() {
    return (
      '**Démarche pour une application autonome avec Docker**\n\n' +
      '1. **Cible** : précisez le processus à exécuter (API, front, worker), le port d’écoute et les variables nécessaires.\n' +
      '2. **Dockerfile** : image de base adaptée (ex. `node:22-alpine`, `python:3.12-slim`), copie du code, installation des dépendances, `EXPOSE`, `CMD` ou `ENTRYPOINT` pour lancer l’app.\n' +
      '3. **`.dockerignore`** : exclure `node_modules`, `.git`, caches — builds plus rapides et images plus petites.\n' +
      '4. **Build & run local** : `docker build -t monapp:local .` puis `docker run --rm -p 8080:8080 -e CLE=valeur monapp:local` (adapter ports et env).\n' +
      '5. **Autonomie** : configuration et secrets via variables d’environnement ou fichiers montés, pas figés dans l’image ; en production, politique de redémarrage et healthcheck selon votre orchestrateur.\n' +
      '6. **Plusieurs services** : un `docker-compose.yml` pour lier app, base de données et cache sur un réseau interne.\n' +
      '7. **Industrialisation** : build de l’image en CI, push vers un registry, déploiement de la même étiquette d’image en recette puis production.\n\n' +
      '_Les extraits ci-dessous viennent de vos cours : gardez ceux qui parlent explicitement de conteneurs, images ou registres ; les passages « cloud » génériques sont seulement du contexte._'
    );
  }

  /** Favorise les phrases qui mentionnent Docker / conteneurs quand la question est orientée Docker. */
  prioritizeDockerSnippets(relevant, message = '') {
    if (!relevant || relevant.length === 0) return relevant;
    const q = this.stripAccents((message || '').toLowerCase());
    if (!/docker|dockerfile|conteneur|container/.test(q)) return relevant;
    const dock = relevant.filter((r) =>
      /docker|dockerfile|conteneur|container|\bimage\b|compose|registry|ecr|kubernetes|pod|scanning container|container image/i.test(
        r.sentence
      )
    );
    return dock.length >= 2 ? dock : relevant;
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

    let relevant = this.extractRelevantSentences(message, ragChunks, 10);
    const intent = this.detectIntent(message);
    const proceduralDocker = this.isDockerSetupQuestion(message) && intent === 'containerization';
    if (proceduralDocker) {
      relevant = this.prioritizeDockerSnippets(relevant, message);
    }
    if (relevant.length === 0) {
      const fallback = this.buildIntentFallback(intent);
      return this.appendSources(`Je n'ai pas trouvé de passage suffisamment clair dans les documents pour cette question. ${fallback}`, externalSources);
    }

    const bulletPoints = relevant
      .map((item, idx) => `- Point ${idx + 1}: ${item.sentence.replace(/\s+/g, ' ').trim()}`)
      .join('\n');
    const sources = [...new Set(relevant.map((item) => item.source))].join(', ');

    const intentLabel = proceduralDocker
      ? 'Mise en place sur Docker'
      : intent === 'containerization'
        ? 'Conteneurisation'
        : intent === 'cicd'
          ? 'CI/CD'
          : intent === 'monitoring'
            ? 'Monitoring'
            : intent === 'devops'
              ? 'Culture DevOps'
              : 'Synthèse';

    const coreAnswer = proceduralDocker
      ? this.buildDockerSetupCoreAnswer()
      : this.buildIntentAnswer(intent, message);
    const explanationBlock = proceduralDocker
      ? '**Extraits des cours (complément)** — privilégiez les points qui citent Docker, images ou registres ; ignorez le reste si hors sujet.'
      : 'Cette réponse est construite à partir des extraits documentaires retrouvés. Elle combine une définition opérationnelle, des points pratiques et des actions concrètes pour passer de la théorie à l’exécution.';
    const recommendedActions = [
      'Clarifier le périmètre (environnement, objectif métier, contraintes de sécurité).',
      'Appliquer la pratique sur un petit cas pilote puis mesurer l’impact.',
      'Automatiser les étapes répétitives (scripts, pipeline CI/CD, checks qualité).',
      'Documenter le runbook opérationnel pour faciliter le support et l’onboarding.',
      'Définir des métriques de suivi (fiabilité, délai de livraison, incidents).',
      'Mettre en place une revue régulière et une amélioration continue.'
    ].join('\n- ');
    const ragAnswer = `${intentLabel}:\n${coreAnswer}\n\nExplication:\n${explanationBlock}\n\nÉléments issus des documents:\n${bulletPoints}\n\nPlan d’action recommandé:\n- ${recommendedActions}\n\nBonnes pratiques:\n- Commencer simple, valider rapidement, puis itérer.\n- Standardiser les conventions (naming, branching, revues, alertes).\n- Sécuriser dès le départ (secrets, accès, scans, sauvegardes).\n- Mesurer en continu pour corriger tôt.\n\nSources utilisees:\n- ${sources}`;
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
    const lowerMessage = this.stripAccents((message || '').toLowerCase());
    const relaxed = lowerMessage.replace(/['\u2019-]/g, ' ').replace(/\s+/g, ' ').trim();
    const topicOnly = relaxed.replace(/[!?.…]+$/u, '').trim();

    if (
      lowerMessage.includes('defini ci') ||
      lowerMessage.includes('c est quoi ci') ||
      lowerMessage.includes("c'est quoi ci")
    ) {
      return 'CI signifie Intégration Continue. C’est une pratique où chaque changement de code est automatiquement testé et validé via un pipeline (build + tests + qualité) pour détecter les erreurs tôt.';
    }

    const asksDefinition =
      /c\s+est\s+quoi\b|quest[\s-]ce\s+que\b|qu\s+est[\s-]ce\s+que\b|definir\b|defini(s)?\b|explique(r)?\b|what\s+is\b|what\s+are\b/i.test(
        relaxed
      );
    if (asksDefinition && /\bserveurs?\b/.test(lowerMessage)) {
      return (
        'Un **serveur**, en informatique, est une machine (physique ou virtuelle) ou un programme qui **met des ressources ou des services à disposition** d’autres machines ou applications, souvent sur un réseau. ' +
        'Exemples : serveur web (pages HTTP), serveur de base de données, serveur d’API. Les **clients** (navigateur, appli mobile, autre service) envoient des requêtes ; le serveur répond ou traite les données. ' +
        'En contexte DevOps, on parle aussi de **serveurs de build**, de **registry** d’images, ou de nœuds dans un cluster.'
      );
    }

    if (
      topicOnly === 'devops' ||
      topicOnly === 'dev ops' ||
      lowerMessage.includes('defini devops') ||
      lowerMessage.includes('definis devops') ||
      lowerMessage.includes('definir devops') ||
      lowerMessage.includes('c est quoi devops') ||
      lowerMessage.includes("c'est quoi devops") ||
      relaxed.includes('quest ce que devops') ||
      relaxed.includes('qu est ce que devops') ||
      lowerMessage.includes('explique devops')
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
