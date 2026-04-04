const request = require('supertest');

jest.setTimeout(30000);

describe('API Tests', () => {
  let app;

  beforeAll(async () => {
    // Importer l'application après la configuration
    app = require('../src/index');
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/bot/status', () => {
    it('should return bot status', async () => {
      const response = await request(app)
        .get('/api/bot/status')
        .expect(200);
      
      expect(response.body).toHaveProperty('bot', 'online');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('uptimeSeconds');
      expect(typeof response.body.uptimeSeconds).toBe('number');
      expect(response.body).toHaveProperty('components');
      expect(Array.isArray(response.body.components)).toBe(true);
      expect(response.body.components.length).toBeGreaterThanOrEqual(3);
      expect(response.body).toHaveProperty('componentsSummary');
      expect(response.body).toHaveProperty('rag');
      expect(response.body.rag).toHaveProperty('enabled');
      expect(response.body.rag).toHaveProperty('operational');
      expect(response.body.rag).toHaveProperty('chromaUrlConfigured');
      expect(response.body.rag).toHaveProperty('indexedChunks');
    });
  });

  describe('GET /', () => {
    it('should serve the frontend', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);
      
      expect(response.text).toContain('DevOps Assistant Bot');
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should reject empty body', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({})
        .expect(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('should reject missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: 'a@b.com' })
        .expect(400);
      expect(response.body.success).toBe(false);
    });
  });
});
