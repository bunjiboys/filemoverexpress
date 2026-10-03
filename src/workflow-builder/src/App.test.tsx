import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';
import { STEP_TYPES } from './schema/loader';

describe('App', () => {
    it('renders a palette item for every schema-derived step type', () => {
        render(<App />);
        const list = screen.getByRole('list', { name: 'step types' });
        const items = screen.getAllByRole('listitem');
        expect(items).toHaveLength(STEP_TYPES.length);
        for (const type of STEP_TYPES) {
            expect(list).toHaveTextContent(type);
        }
    });
});
