class KnowledgeService {
  constructor() {
    this.trustedSources = [
      {
        title: 'Kubernetes Documentation',
        url: 'https://kubernetes.io/docs/',
        tags: ['kubernetes', 'k8s', 'cluster', 'deployment', 'pod']
      },
      {
        title: 'Docker Documentation',
        url: 'https://docs.docker.com/',
        tags: ['docker', 'container', 'image', 'compose']
      },
      {
        title: 'Prometheus Documentation',
        url: 'https://prometheus.io/docs/',
        tags: ['prometheus', 'metrics', 'monitoring', 'alert']
      },
      {
        title: 'Grafana Documentation',
        url: 'https://grafana.com/docs/',
        tags: ['grafana', 'dashboard', 'visualization', 'alerting']
      },
      {
        title: 'GitHub Actions Documentation',
        url: 'https://docs.github.com/actions',
        tags: ['ci', 'cd', 'pipeline', 'github actions']
      },
      {
        title: 'OpenClassrooms',
        url: 'https://openclassrooms.com/fr/',
        tags: ['openclassrooms', 'cours', 'formation']
      }
    ];
  }

  getMatchingSources(message) {
    const normalized = (message || '').toLowerCase();
    if (!normalized) {
      return [];
    }

    return this.trustedSources.filter((source) =>
      source.tags.some((tag) => normalized.includes(tag))
    );
  }

  async getGroundingContext(message) {
    const matched = this.getMatchingSources(message);
    const clipped = matched.slice(0, 4).map((item) => ({
      title: item.title,
      url: item.url,
      date: new Date().toISOString().slice(0, 10)
    }));

    const promptContext = clipped.length > 0
      ? clipped
          .map(
            (source, idx) =>
              `- Source ${idx + 1}: ${source.title} (${source.url}) [date: ${source.date}]`
          )
          .join('\n')
      : '- Aucune source externe spécifique détectée pour cette question.';

    return {
      contextText: promptContext,
      sources: clipped
    };
  }
}

module.exports = KnowledgeService;
