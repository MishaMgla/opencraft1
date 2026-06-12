import { defineConfig, devices } from '@playwright/test';

// End-to-end smoke test config. Boots the real Go server (which serves this
// web/ directory and the /ws endpoint) and drives a headless Chromium against
// it. Kept deliberately small: it proves the browser→server wiring works
// (module load, pixi CDN load, WebSocket handshake, input loop) — the layer
// the Go/Node unit suites cannot see. Protocol/logic correctness is covered
// by the unit tests, not here.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'line',

  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Build + run the Go server from the repo root so http.Dir("web") resolves.
  webServer: {
    command: 'go run ./cmd/server',
    cwd: '..',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
