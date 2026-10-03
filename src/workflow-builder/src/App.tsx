import { STEP_TYPES } from './schema/loader';

// Thin composition root (docs/Workflow-Builder-App.md section 13): no business
// logic, no parsing, no layout math. As the app grows this wires the Cloudscape
// AppLayout, the view-mode control, and the top-level panels together. For now it
// renders the step palette derived from the bundled schema, proving the schema is
// the single source of the node types.
export function App(): React.JSX.Element {
    return (
        <main>
            <h1>FME Workflow Builder</h1>
            <ul aria-label="step types">
                {STEP_TYPES.map((type) => (
                    <li key={type}>{type}</li>
                ))}
            </ul>
        </main>
    );
}
