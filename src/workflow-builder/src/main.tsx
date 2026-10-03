import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// DOM mount bootstrap. Excluded from the coverage gate (vitest.config.ts) as
// non-logic glue, per section 13's justified-exclusion rule.
createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
