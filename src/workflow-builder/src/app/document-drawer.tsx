import { useEffect } from 'react';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import { DocumentPanel } from './document-panel';
import { surfaceColors } from '../canvas/theme';
import type { DocumentPatch } from '../canvas/graph-mutations';
import type { ColorMode } from './use-color-mode';
import type { WorkflowGraph } from '../workflow/graph';

export interface DocumentDrawerProps {
    open: boolean;
    graph: WorkflowGraph;
    colorMode?: ColorMode;
    onChange: (patch: DocumentPatch) => void;
    onClose: () => void;
}

// A right-anchored OVERLAY panel for the document fields (docs section 15). It is
// position: fixed so opening it floats over the canvas/editor instead of reflowing
// them (the AppLayout tools drawer pushed content, which the user did not want), and
// is comfortably wide for the parameters table. Closes via its button or Escape. The
// field editing is DocumentPanel; this is just the overlay shell.
export function DocumentDrawer({ open, graph, colorMode = 'light', onChange, onClose }: DocumentDrawerProps): React.JSX.Element | null {
    useEffect(() => {
        if (!open) {
            return undefined;
        }
        const onKeyDown = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open, onClose]);

    if (!open) {
        return null;
    }

    const colors = surfaceColors(colorMode);
    return (
        <div
            data-testid="document-drawer"
            role="complementary"
            aria-label="Document"
            style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: 'min(40vw, 560px)',
                minWidth: 340,
                zIndex: 900,
                padding: 20,
                overflowY: 'auto',
                background: colors.background,
                color: colors.text,
                borderLeft: `1px solid ${colors.border}`,
                boxShadow: '-2px 0 12px rgba(0,0,0,0.3)',
            }}
        >
            <Box float="right">
                <Button
                    data-testid="document-drawer-close"
                    iconName="close"
                    variant="icon"
                    ariaLabel="Close document panel"
                    onClick={onClose}
                />
            </Box>
            <Box variant="h2" padding={{ bottom: 's' }}>Document</Box>
            <DocumentPanel graph={graph} onChange={onChange} />
        </div>
    );
}
