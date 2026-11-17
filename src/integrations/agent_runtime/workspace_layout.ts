import path from "node:path";

import type {
    HeadlessSpec,
    OpenWorkspaceSummary,
    RuntimeDir,
    WorkspaceSpec,
} from "@/integrations/agent_runtime/agent_runtime.js";
import type { ContainerMount } from "@/integrations/agent_runtime/container_manager.js";

export interface HostUser {
    uid: number;
    gid: number;
}

export const WORKSPACE_DIR_IN_CONTAINER = "/home/agent/workspace";
export const RUNTIME_DIR_IN_CONTAINER = "/home/agent/.forja";
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

export function runtimeDirFor(runtimeRoot: string, containerName: string): RuntimeDir {
    return { host: path.join(runtimeRoot, containerName), container: RUNTIME_DIR_IN_CONTAINER };
}

// The worktree's `.git` file points at the repository's common git dir by absolute path, so that
// dir must exist at the same path inside the container for git to work there.
export function workspaceMounts(
    worktreePath: string,
    gitCommonDir: string,
    runtimeDir: RuntimeDir,
): ContainerMount[] {
    return [
        { host: worktreePath, container: WORKSPACE_DIR_IN_CONTAINER },
        { host: gitCommonDir, container: toContainerPath(gitCommonDir) },
        runtimeDirMount(runtimeDir),
    ];
}

// Read-only: the agent can read its MCP file but not rewrite the next node's.
export function runtimeDirMount(runtimeDir: RuntimeDir): ContainerMount {
    return { host: runtimeDir.host, container: runtimeDir.container, readOnly: true };
}

export function readOnlyRepositoryMount(repoPath: string): ContainerMount {
    return { host: repoPath, container: WORKSPACE_DIR_IN_CONTAINER, readOnly: true };
}

/** A relative working directory is relative to the workspace dir. */
export function workdirInContainer(workingDir = ""): string {
    return path.posix.resolve(WORKSPACE_DIR_IN_CONTAINER, workingDir);
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

// Windows has no uid/gid; Docker Desktop maps the owner of the mounted files by itself there.
export function currentHostUser(): HostUser | null {
    if (!process.getuid || !process.getgid) {
        return null;
    }

    return { uid: process.getuid(), gid: process.getgid() };
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
