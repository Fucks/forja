import type {
    HeadlessSpec,
    OpenWorkspaceSummary,
    WorkspaceSpec,
} from "@/integrations/agent_runtime/agent_runtime.js";
import type { ContainerMount } from "@/integrations/agent_runtime/container_manager.js";

export interface HostUser {
    uid: number;
    gid: number;
}

export const WORKSPACE_DIR_IN_CONTAINER = "/home/agent/workspace";
export const WORKSPACE_LABEL = "forja.workspace";
const RUN_LABEL = "forja.run";
const ITEM_LABEL = "forja.item";
const PROJECT_LABEL = "forja.project";

const CONTAINER_NAME_PREFIX = "forja";
const CONTAINER_NAME_SEPARATOR = "-";
const SHORT_ID_LENGTH = 8;
const NOT_ALLOWED_IN_SHORT_ID = /[^a-z0-9]/g;
const WINDOWS_DRIVE_PATH = /^([A-Za-z]):[\\/](.*)$/;
const WINDOWS_PATH_SEPARATOR = /\\/g;

/** The workspace id is also its container name: `forja-<runId curto>-<itemId curto>`. */
export function workspaceIdFor(runId: string, workItemId: string): string {
    return containerNameFor(runId, workItemId);
}

export function headlessContainerNameFor(runId: string, nodeRunId: string): string {
    return containerNameFor(runId, nodeRunId);
}

export function workspaceLabels(workspaceId: string, spec: WorkspaceSpec): Record<string, string> {
    return {
        [WORKSPACE_LABEL]: workspaceId,
        [RUN_LABEL]: spec.runId,
        [ITEM_LABEL]: spec.workItemId,
        [PROJECT_LABEL]: spec.projectId,
    };
}

export function headlessLabels(spec: HeadlessSpec): Record<string, string> {
    const labels = { [RUN_LABEL]: spec.runId, [PROJECT_LABEL]: spec.projectId };
    if (spec.workItemId === undefined) {
        return labels;
    }

    return { ...labels, [ITEM_LABEL]: spec.workItemId };
}

export function summarizeWorkspace(labels: Record<string, string>): OpenWorkspaceSummary {
    return {
        id: labels[WORKSPACE_LABEL] ?? "",
        runId: labels[RUN_LABEL] ?? "",
        workItemId: labels[ITEM_LABEL] ?? "",
    };
}

// The worktree's `.git` file points at the repository's common git dir by absolute path, so that
// dir must exist at the same path inside the container for git to work there.
export function workspaceMounts(worktreePath: string, gitCommonDir: string): ContainerMount[] {
    return [
        { host: worktreePath, container: WORKSPACE_DIR_IN_CONTAINER },
        { host: gitCommonDir, container: toContainerPath(gitCommonDir) },
    ];
}

export function readOnlyRepositoryMount(repoPath: string): ContainerMount {
    return { host: repoPath, container: WORKSPACE_DIR_IN_CONTAINER, readOnly: true };
}

/** Docker Desktop on Windows exposes `C:\x\y` to Linux containers as `/c/x/y`. */
export function toContainerPath(hostPath: string): string {
    const windowsPath = WINDOWS_DRIVE_PATH.exec(hostPath);
    if (!windowsPath) {
        return hostPath;
    }

    const [, drive = "", rest = ""] = windowsPath;
    return `/${drive.toLowerCase()}/${rest.replace(WINDOWS_PATH_SEPARATOR, "/")}`;
}

/** Without a host user (Windows) the container keeps the image's default user. */
export function containerUserFor(hostUser: HostUser | null): string | undefined {
    return hostUser ? `${hostUser.uid}:${hostUser.gid}` : undefined;
}

function containerNameFor(runId: string, ownerId: string): string {
    return [CONTAINER_NAME_PREFIX, shortId(runId), shortId(ownerId)].join(CONTAINER_NAME_SEPARATOR);
}

function shortId(id: string): string {
    return id.toLowerCase().replace(NOT_ALLOWED_IN_SHORT_ID, "").slice(-SHORT_ID_LENGTH);
}
