import { ReactFlowProvider } from "@xyflow/react";
import { TriangleAlert } from "lucide-react";
import type { JSX } from "react";
import { useParams } from "react-router";

import { DraftConflictBanner } from "@/web/app/flows/draft_conflict_banner.js";
import { EditorSidePanel } from "@/web/app/flows/editor_side_panel.js";
import { EditorTopBar } from "@/web/app/flows/editor_top_bar.js";
import { useDraftDiffers } from "@/web/app/flows/use_draft_differs.js";
import { useEditorIssues } from "@/web/app/flows/use_editor_issues.js";
import { useFlowSummary } from "@/web/app/flows/use_flow_summary.js";
import type { EditorStore } from "@/web/canvas/editor_store.js";
import { FlowCanvas } from "@/web/canvas/flow_canvas.js";
import { InspectorPanel } from "@/web/canvas/inspector/inspector_panel.js";
import { NodePalette } from "@/web/canvas/palette/node_palette.js";
import { ProblemsPanel } from "@/web/canvas/problems_panel.js";
import { PublishBar } from "@/web/canvas/publish_bar.js";
import { useFlowDraft } from "@/web/canvas/use_flow_draft.js";
import type { FlowDraftEditor } from "@/web/canvas/use_flow_draft.js";
import { EmptyState } from "@/web/components/ui/empty_state.js";
import { Skeleton } from "@/web/components/ui/skeleton.js";
import { flowVersionsPath } from "@/web/config/navigation.js";

export function FlowEditorPage(): JSX.Element {
    const { projectId = "", flowId = "" } = useParams();

    // A new editor per flow, so one flow's pending save never lands on another flow's store.
    return <FlowEditor key={flowId} projectId={projectId} flowId={flowId} />;
}

interface FlowLocation {
    projectId: string;
    flowId: string;
}

function FlowEditor({ projectId, flowId }: FlowLocation): JSX.Element {
    const draftEditor = useFlowDraft(flowId);
    const flowSummary = useFlowSummary(projectId, flowId).data;
    const saveState = draftEditor.store((state) => state.saveState);
    const dirty = draftEditor.store((state) => state.dirty);

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <EditorTopBar
                flowName={flowSummary?.name}
                saveState={saveState}
                dirty={dirty}
                versionsPath={flowVersionsPath(projectId, flowId)}
            />
            {saveState === "conflict" && <DraftConflictBanner onReload={draftEditor.reload} />}
            <EditorWorkspace
                draftEditor={draftEditor}
                location={{ projectId, flowId }}
                latestVersion={flowSummary?.latestVersion}
            />
        </div>
    );
}

function EditorWorkspace({
    draftEditor,
    location,
    latestVersion,
}: {
    draftEditor: FlowDraftEditor;
    location: FlowLocation;
    latestVersion: number | undefined;
}): JSX.Element {
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

    // The palette creates nodes at the canvas viewport, so both share one React Flow instance.
    return (
        <ReactFlowProvider>
            <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-border">
                <EditorSidePanel title="Paleta" side="left" widthClass="w-60">
                    <NodePalette store={draftEditor.store} />
                </EditorSidePanel>
                <EditorCanvasArea
                    store={draftEditor.store}
                    flowId={location.flowId}
                    latestVersion={latestVersion}
                />
                <EditorSidePanel title="Inspector" side="right" widthClass="w-90">
                    <InspectorPanel store={draftEditor.store} projectId={location.projectId} />
                </EditorSidePanel>
            </div>
        </ReactFlowProvider>
    );
}

// The canvas stays the draft; the publish bar above it names the version that runs.
function EditorCanvasArea({
    store,
    flowId,
    latestVersion,
}: {
    store: EditorStore;
    flowId: string;
    latestVersion: number | undefined;
}): JSX.Element {
    const graph = store((state) => state.graph);
    const editorIssues = useEditorIssues(graph);
    const draftDiffers = useDraftDiffers({ flowId, draftGraph: graph, latestVersion });

    return (
        <div className="flex min-w-0 flex-1 flex-col">
            <PublishBar
                flowId={flowId}
                latestVersion={latestVersion}
                draftDiffers={draftDiffers}
                errorCount={editorIssues.errorCount}
                onPublished={ignorePublishedVersion}
                onRejected={editorIssues.showRefusedPublish}
            />
            <div className="min-h-0 flex-1">
                <FlowCanvas store={store} issuesByTarget={editorIssues.byTarget} />
            </div>
            <ProblemsPanel validation={editorIssues} store={store} />
        </div>
    );
}

// The new version reaches the editor through the refreshed flow summary.
function ignorePublishedVersion(): void {}
