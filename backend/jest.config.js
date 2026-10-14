const transform = {
  '^.+\\.ts$': [
    'ts-jest',
    {
      tsconfig: '<rootDir>/tsconfig.json',
    },
  ],
};

const base = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform,
  testEnvironment: 'node',
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/generated/**', '!src/main.ts'],
  coverageDirectory: '<rootDir>/coverage',
};

module.exports = {
  projects: [
    {
      ...base,
      displayName: 'unit',
      rootDir: __dirname,
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
    },
    {
      ...base,
      displayName: 'integration',
      rootDir: __dirname,
      testMatch: ['<rootDir>/test/**/*.integration-spec.ts'],
      setupFiles: ['<rootDir>/test/setup-env.ts'],
      testTimeout: 30000,
    },
  ],
};
