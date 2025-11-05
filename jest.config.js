// jest.config.js
export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.js'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(tone)/)'
  ],
  moduleNameMapper: {
    "^tone$": "tone", // ensures tone mock resolves correctly
  },
  setupFilesAfterEnv: ["./src/tests/setup.js"],
};
