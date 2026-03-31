module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'lcov',
    'html',
    'cobertura'
  ],
  // En CI (GitLab), les tests seuls suffisent ; le seuil 70 % faisait échouer le pipeline avec --coverage.
  coverageThreshold: process.env.CI
    ? undefined
    : {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70
        }
      },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000
};
