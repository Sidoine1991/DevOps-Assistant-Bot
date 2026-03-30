// Configuration de test pour Jest
const { beforeAll, afterAll } = require('@jest/globals');

// Configuration globale pour les tests
beforeAll(() => {
  // Désactiver les logs pendant les tests
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  // Nettoyage après les tests
  jest.restoreAllMocks();
});

// Mock pour les variables d'environnement
process.env.NODE_ENV = 'test';
process.env.PORT = '3001'; // Port différent pour les tests
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Timeout pour les tests asynchrones
jest.setTimeout(10000);
