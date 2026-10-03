import AppLayout from '@cloudscape-design/components/app-layout';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useViewMode } from './app/use-view-mode';
import { ViewModeControl } from './app/view-mode-control';
import { useColorMode } from './app/use-color-mode';
import { ColorModeToggle } from './app/color-mode-toggle';

// Thin composition root (docs section 13): it owns the view-mode and color-mode state
// and lays out the Cloudscape shell. It holds no business logic - parsing, layout and
// validation live in their own modules. The canvas and editor panes are placeholders
// until those steps (9, 8) land; this wires view switching and light/dark.
export function App(): React.JSX.Element {
    const view = useViewMode();
    const color = useColorMode();

    return (
        <AppLayout
            toolsHide
            navigationHide
            content={
                <ContentLayout
                    header={
                        <Header
                            variant="h1"
                            actions={
                                <SpaceBetween direction="horizontal" size="xs">
                                    <ViewModeControl mode={view.mode} onChange={view.setMode} />
                                    <ColorModeToggle mode={color.mode} onToggle={color.toggle} />
                                </SpaceBetween>
                            }
                        >
                            FME Workflow Builder
                        </Header>
                    }
                >
                    <div style={{ display: 'flex', gap: 16 }}>
                        {view.showCanvas && (
                            <div data-testid="canvas-pane">Canvas</div>
                        )}
                        {view.showEditor && (
                            <div data-testid="editor-pane">Editor</div>
                        )}
                    </div>
                </ContentLayout>
            }
        />
    );
}
