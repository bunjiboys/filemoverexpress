import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite build config for the Workflow Builder static site.
// Produces dist/ as a self-contained SPA (the deployable artifact, and the exact
// bundle a later Wails shell would embed). See docs/designs/workflows/Workflow-Builder-App.md section 12.
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
});
