import { TriangleAlert } from "lucide-react";
import type { JSX } from "react";
import { useParams } from "react-router";

import { DraftConflictBanner } from "@/web/app/flows/draft_conflict_banner.js";
import { EditorSidePanel } from "@/web/app/flows/editor_side_panel.js";
import { EditorTopBar } from "@/web/app/flows/editor_top_bar.js";
import { useFlowSummary } from "@/web/app/flows/use_flow_summary.js";
import { FlowCanvas } from "@/web/canvas/flow_canvas.js";
import { useFlowDraft } from "@/web/canvas/use_flow_draft.js";
import type { FlowDraftEditor } from "@/web/canvas/use_flow_draft.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";

export function FlowEditorPage(): JSX.Element {
    const { projectId = "", flowId = "" } = useParams();

    // A new editor per flow, so one flow's pending save never lands on another flow's store.
    return <FlowEditor key={flowId} projectId={projectId} flowId={flowId} />;
}

function FlowEditor({ projectId, flowId }: { projectId: string; flowId: string }): JSX.Element {
    const draftEditor = useFlowDraft(flowId);
    const flowName = useFlowSummary(projectId, flowId).data?.name;
    const saveState = draftEditor.store((state) => state.saveState);
    const dirty = draftEditor.store((state) => state.dirty);

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <EditorTopBar flowName={flowName} saveState={saveState} dirty={dirty} />
            {saveState === "conflict" && <DraftConflictBanner onReload={draftEditor.reload} />}
            <EditorWorkspace draftEditor={draftEditor} />
        </div>
    );
}

function EditorWorkspace({ draftEditor }: { draftEditor: FlowDraftEditor }): JSX.Element {
    if (draftEditor.isLoading) {
        return <Skeleton className="min-h-0 flex-1" />;
    }
    if (draftEditor.loadError) {
        return (
            <EmptyState
                icon={TriangleAlert}
                title="Não foi possível abrir o rascunho"
                description={draftEditor.loadError.message}
            />
        );
    }

    return (
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-border">
            <EditorSidePanel title="Paleta" side="left" widthClass="w-60" />
            <div className="min-w-0 flex-1">
                <FlowCanvas store={draftEditor.store} />
            </div>
            <EditorSidePanel title="Inspector" side="right" widthClass="w-90" />
        </div>
    );
}
