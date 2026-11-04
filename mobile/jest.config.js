module.exports = {
  preset: "jest-expo",
  testMatch: ["**/tests/**/*.test.[jt]s?(x)"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  moduleNameMapper: {
    "^lucide-react-native$": require.resolve("lucide-react-native"),
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: ["src/api/**/*.{ts,tsx}", "src/utils/**/*.ts"],
};
