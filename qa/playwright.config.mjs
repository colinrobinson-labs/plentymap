import { defineConfig } from "@playwright/test";
import { BASE, SITE_DIR, LIVE } from "./lib/matrix.mjs";

export default defineConfig({
  testDir: "./tests",
  outputDir: "./results/artifacts",
  snapshotPathTemplate: "./visual-baseline/{arg}{ext}",
  fullyParallel: true,
  workers: process.env.CI ? 3 : 4,
  retries: 0,
  reporter: [[process.env.CI ? "dot" : "line"], ["json", { outputFile: "results/report.json" }], ["html", { outputFolder: "results/html", open: "never" }]],
  timeout: 120_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.2, animations: "disabled", caret: "hide" } },
  use: {
    baseURL: BASE,
    trace: "off",
    actionTimeout: 5000,
    navigationTimeout: 20000,
    // the map draws with WebGL; give headless Chromium a software GPU
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  },
  projects: [
    { name: "layout", testMatch: /layout\.spec/ },
    { name: "states", testMatch: /states\.spec/ },
    { name: "a11y", testMatch: /a11y\.spec/ },
    { name: "links", testMatch: /links\.spec/ },
    { name: "visual", testMatch: /visual\.spec/ },
  ],
  webServer: LIVE ? undefined : { command: `node serve.mjs "${SITE_DIR}" 4173`, url: "http://localhost:4173/", reuseExistingServer: true },
});
