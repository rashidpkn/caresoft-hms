import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/security/**/*.test.ts"],
    globalSetup: "./tests/global-setup.ts",
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 60000,
    hookTimeout: 60000,
    env: {
      DATABASE_URL: "postgres://synapse:synapse_dev_local@127.0.0.1:5432/synapse_hms_test",
      HMS_SECRET: "test-secret-test-secret-test-secret-test-123456",
      INITIAL_ADMIN_PASSWORD: "ChangeMe_Admin_1",
      DEMO_PASSWORD: "Hospital_Demo_1",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
