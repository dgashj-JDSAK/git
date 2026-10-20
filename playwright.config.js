import { defineConfig } from "@playwright/test";
import fs from "node:fs";
const executable =
  process.env.CHROMIUM_PATH ||
  (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3173",
    viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: executable, args: ["--no-sandbox"] },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server/index.js --production",
    url: "http://127.0.0.1:3173",
    env: {
      WANXIANG_TEST_MODE: "1",
      WANXIANG_AI_KEY: "",
      OPENAI_API_KEY: "",
      OPENAI_BASE_URL: "",
      WANXIANG_PASSWORD: "",
      PORT: "3173",
      HOST: "127.0.0.1",
      WANXIANG_DATA_DIR: "/tmp/wanxiang-e2e-" + process.pid,
    },
    reuseExistingServer: false,
  },
  reporter: "list",
});
