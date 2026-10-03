import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Cloudscape's global stylesheet sets the themed body background and typography, so
// the page edges follow light/dark instead of showing the browser's white default.
import '@cloudscape-design/global-styles/index.css';
import './index.css';
import { App } from './App';

// DOM mount bootstrap. Excluded from the coverage gate (vitest.config.ts) as
// non-logic glue, per section 13's justified-exclusion rule.
createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
