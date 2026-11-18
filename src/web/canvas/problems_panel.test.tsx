import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";

import type { ValidationIssue } from "@/shared/validation_issue.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { createEditorStore } from "@/web/canvas/editor_store.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import {
    createFieldFocusStore,
    FieldFocusContext,
} from "@/web/canvas/inspector/use_focus_field.js";
import type { FieldFocusStore } from "@/web/canvas/inspector/use_focus_field.js";
import { ProblemsPanel } from "@/web/canvas/problems_panel.js";
import { summarizeIssues } from "@/web/canvas/use_validation.js";

const EMPTY_PROMPT_ISSUE: ValidationIssue = {
    level: "error",
    code: "empty_prompt",
    message: "O Agente ‘Dev’ não tem prompt.",
    fix: "Escreva o que o agente deve fazer na aba Configurar › Prompt.",
    fieldKey: "prompt",
    target: { kind: "node", id: "dev" },
};

const CYCLE_ISSUE: ValidationIssue = {
    level: "error",
    code: "cycle_outside_loop",
    message: "Os nós ‘Dev’, ‘Reviewer’ formam uma volta fora de um Loop.",
    fix: "Selecione esses nós e agrupe-os num Loop.",
    target: { kind: "node", id: "reviewer" },
};

describe("ProblemsPanel", () => {
    it("tells how to fix each problem and names its code", () => {
        renderPanel([EMPTY_PROMPT_ISSUE]);

        expect(
            screen.getByText(
                "Como corrigir: Escreva o que o agente deve fazer na aba Configurar › Prompt.",
            ),
        ).toBeInTheDocument();
        expect(screen.getByText("(código: empty_prompt)")).toBeInTheDocument();
    });

    it("shows the level of a problem with an icon and a name, not only a color", () => {
        renderPanel([EMPTY_PROMPT_ISSUE]);

        expect(screen.getByRole("img", { name: "Erro" })).toBeInTheDocument();
    });

    it("selects the node of the clicked problem and asks the inspector for its field", async () => {
        const { store, fieldFocusStore } = renderPanel([EMPTY_PROMPT_ISSUE]);

        await userEvent.click(screen.getByRole("button", { name: /não tem prompt/ }));

        expect(store.getState().selection).toEqual(["dev"]);
        expect(fieldFocusStore.getState().pendingRequest).toEqual({
            targetId: "dev",
            fieldKey: "prompt",
        });
    });

    it("only selects the node when the problem points to no field", async () => {
        const { store, fieldFocusStore } = renderPanel([CYCLE_ISSUE]);

        await userEvent.click(screen.getByRole("button", { name: /formam uma volta/ }));

        expect(store.getState().selection).toEqual(["reviewer"]);
        expect(fieldFocusStore.getState().pendingRequest).toBeUndefined();
    });
});

function renderPanel(issues: ValidationIssue[]): {
    store: EditorStore;
    fieldFocusStore: FieldFocusStore;
} {
    const store = createEditorStore();
    store.getState().load({
        flowId: "flw_1",
        graph: buildCanonicalFlow(),
        revision: 1,
        updatedAt: "2026-11-18T12:00:00Z",
    });
    const fieldFocusStore = createFieldFocusStore();

    render(
        <ReactFlowProvider>
            <FieldFocusContext value={fieldFocusStore}>
                <ProblemsPanel validation={summarizeIssues(issues)} store={store} />
            </FieldFocusContext>
        </ReactFlowProvider>,
    );

    return { store, fieldFocusStore };
}
