export default {
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.[tj]sx?$": "babel-jest",
  },
  transformIgnorePatterns: ["/node_modules/(?!tone/)"],
  moduleNameMapper: {
    "^tone$": "tone", // ensures tone mock resolves correctly
  },
  setupFilesAfterEnv: ["./src/tests/setup.js"],
};
