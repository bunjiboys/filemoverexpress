import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest config: unit/component tier (Tier 1) with the 100% coverage gate.
// See docs/designs/workflows/Workflow-Builder-App.md section 13. The Playwright E2E tier (Tier 2) is
// configured separately in playwright.config.ts and is NOT merged into this number.
export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        // E2E specs run under Playwright, not Vitest.
        exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            // Only our own source counts toward the gate.
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                // Non-logic glue that cannot be meaningfully unit-tested. Each
                // exclusion is deliberate and justified here, per section 13's
                // "honesty about 100%" rule - never a blanket catch-all.
                'src/main.tsx', // DOM mount bootstrap
                'src/editor/lazy-code-editor.tsx', // Cloudscape CodeEditor + Ace glue; always mocked, un-runnable in jsdom
                'src/io/file-access.ts', // browser file-dialog + download glue; driven only through the DOM, consumed via a mock FileAccess in tests
                'src/**/*.d.ts',
                'src/test/**', // test setup/helpers
            ],
            // The gate: 100% across every metric, enforced per-file so a single
            // under-covered file fails the build, not just the aggregate.
            thresholds: {
                perFile: true,
                lines: 100,
                functions: 100,
                branches: 100,
                statements: 100,
            },
        },
    },
});
