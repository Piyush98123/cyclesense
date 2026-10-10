module.exports = {
  preset: "jest-expo",
  // Only the pure data-layer modules are covered for now (see
  // src/data/__tests__/). Testing useCycleSense.ts itself requires mocking
  // the native module and driving fake timers through its effects - a
  // bigger, separate lift, tracked as the natural next step once this
  // baseline is in place.
  testPathIgnorePatterns: ["/node_modules/", "/android/", "/ios/", "/__tests__/fixtures.ts$"],
  collectCoverageFrom: [
    "src/data/**/*.ts",
    "!src/data/**/__tests__/**",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};
