import type { ColorMode } from '../app/use-color-mode';

export interface SurfaceColors {
    background: string;
    text: string;
    border: string;
}

// Explicit surface colors for elements that render inside React Flow's own DOM (the
// custom node, the context menu), where Cloudscape's container CSS variables do not
// resolve - so a var()-with-light-fallback renders white in dark mode. In dark mode we
// use a dark blue a bit lighter than the canvas background (Cloudscape dark canvas is
// ~#0f1b2d) so nodes/menus read as raised surfaces; in light mode a plain white
// surface. Each pairs a background with a readable text and border color.
const DARK: SurfaceColors = { background: '#1b2a41', text: '#ffffff', border: '#3b4b63' };
const LIGHT: SurfaceColors = { background: '#ffffff', text: '#000716', border: '#8c8c94' };

export function surfaceColors(mode: ColorMode): SurfaceColors {
    return mode === 'dark' ? DARK : LIGHT;
}

// The app font, for elements that render inside React Flow's DOM (node, context menu).
// Cloudscape's --font-family-base IS defined on :root (unlike the container-scoped
// color tokens), so it resolves here; the sans-serif fallback keeps the text from
// defaulting to the browser serif if the variable is ever missing.
export const UI_FONT_FAMILY =
    'var(--font-family-base, "Open Sans", "Helvetica Neue", Arial, sans-serif)';
