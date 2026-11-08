import path from "node:path";

import type {
    AgentContainer,
    RunAgentInContainer,
} from "@/integrations/agent_runtime/agent_container.js";
import { AgentCanceledError } from "@/integrations/agent_runtime/agent_errors.js";
import type {
    AgentRunHooks,
    AgentRunRequest,
    AgentRunResult,
    AgentRuntime,
    HeadlessSpec,
    OpenWorkspaceSummary,
    Workspace,
    WorkspaceSpec,
} from "@/integrations/agent_runtime/agent_runtime.js";
import {
    createContainerManager,
    type ContainerMount,
    type StartContainerInput,
} from "@/integrations/agent_runtime/container_manager.js";
import {
    createDockerWorkspace,
    type OpenedWorkspace,
} from "@/integrations/agent_runtime/docker_workspace.js";
import { writeWorkspaceFiles } from "@/integrations/agent_runtime/workspace_files.js";
import {
    containerUserFor,
    headlessContainerNameFor,
    headlessLabels,
    readOnlyRepositoryMount,
    summarizeWorkspace,
    toContainerPath,
    WORKSPACE_DIR_IN_CONTAINER,
    WORKSPACE_LABEL,
    workspaceIdFor,
    workspaceLabels,
    workspaceMounts,
    type HostUser,
} from "@/integrations/agent_runtime/workspace_layout.js";
import { runSetupCommands } from "@/integrations/agent_runtime/workspace_setup.js";
import {
    createWorktreeManager,
    readGitCommonDir,
} from "@/integrations/agent_runtime/worktree_manager.js";
import type { CommandRunner } from "@/integrations/process/command_runner.js";
import type { Clock } from "@/lib/clock.js";
import type { ForjaPaths } from "@/lib/paths.js";

export interface DockerAgentRuntimeDeps {
    commands: CommandRunner;
    paths: ForjaPaths;
    clock: Clock;
    hostUser: HostUser | null;
    runAgentInContainer: RunAgentInContainer;
}

const WORKSPACE_READY_MESSAGE = "workspace pronto";

export function createDockerAgentRuntime(deps: DockerAgentRuntimeDeps): AgentRuntime {
    const { commands, paths, clock } = deps;
    const worktrees = createWorktreeManager(commands);
    const containers = createContainerManager(commands);
    const containerUser = containerUserFor(deps.hostUser);
    const openWorkspaces = new Map<string, OpenedWorkspace>();

    async function openWorkspace(
        spec: WorkspaceSpec,
        hooks: AgentRunHooks,
        signal: AbortSignal,
    ): Promise<Workspace> {
        throwIfAborted(signal);
        const worktree = await worktrees.ensure({
            repoPath: spec.repoPath,
            worktreesDir: path.join(paths.worktrees, spec.projectId),
            branch: spec.branch,
            baseBranch: spec.baseBranch,
        });
        const id = workspaceIdFor(spec.runId, spec.workItemId);
        await removeLeftoverContainer(id);

        const containerId = await startPreparedContainer(
            {
                name: id,
                image: spec.image,
                mounts: await workspaceMountsFor(spec.repoPath, worktree.path, hooks),
                labels: workspaceLabels(id, spec),
                workdir: WORKSPACE_DIR_IN_CONTAINER,
                user: containerUser,
            },
            async (startedId) => {
                await writeWorkspaceFiles(worktree.path, spec.files);
                await runSetup(startedId, spec, hooks, signal);
            },
        );

        return registerWorkspace(
            {
                id,
                branch: spec.branch,
                containerId,
                worktreePath: worktree.path,
                repoPath: spec.repoPath,
                env: spec.env,
            },
            hooks,
        );
    }

    async function runHeadless(
        spec: HeadlessSpec,
        request: AgentRunRequest,
        hooks: AgentRunHooks,
    ): Promise<AgentRunResult> {
        throwIfAborted(request.signal);
        const containerId = await startPreparedContainer(
            {
                name: headlessContainerNameFor(spec.runId, request.nodeRunId),
                image: spec.image,
                mounts: [readOnlyRepositoryMount(spec.repoPath)],
                labels: headlessLabels(spec),
                workdir: WORKSPACE_DIR_IN_CONTAINER,
                user: containerUser,
            },
            (startedId) => runSetup(startedId, spec, hooks, request.signal),
        );

        try {
            return await deps.runAgentInContainer(
                agentContainer(containerId, spec.env),
                request,
                hooks,
            );
        } finally {
            await containers.stop(containerId);
        }
    }

    async function closeWorkspace(id: string): Promise<void> {
        const opened = openWorkspaces.get(id);
        if (!opened) {
            await removeContainersOf(id);
            return;
        }

        await containers.stop(opened.containerId);
        await worktrees.remove(opened.repoPath, opened.worktreePath);
        openWorkspaces.delete(id);
    }

    async function listOpenWorkspaces(): Promise<OpenWorkspaceSummary[]> {
        const found = await containers.list({ [WORKSPACE_LABEL]: "" });
        return found.map((container) => summarizeWorkspace(container.labels));
    }

    async function startPreparedContainer(
        input: StartContainerInput,
        prepare: (containerId: string) => Promise<void>,
    ): Promise<string> {
        const { id } = await containers.start(input);
        try {
            await prepare(id);
        } catch (error) {
            await containers.stop(id);
            throw error;
        }

        return id;
    }

    async function workspaceMountsFor(
        repoPath: string,
        worktreePath: string,
        hooks: AgentRunHooks,
    ): Promise<ContainerMount[]> {
        const gitCommonDir = await readGitCommonDir(commands, repoPath);
        const gitDirInContainer = toContainerPath(gitCommonDir);
        if (gitDirInContainer !== gitCommonDir) {
            emitSystemEvent(hooks, `${gitCommonDir} montado no container em ${gitDirInContainer}`);
        }

        return workspaceMounts(worktreePath, gitCommonDir);
    }

    function runSetup(
        containerId: string,
        spec: HeadlessSpec,
        hooks: AgentRunHooks,
        signal: AbortSignal,
    ): Promise<void> {
        return runSetupCommands({
            containers,
            clock,
            containerId,
            setupCommands: spec.setupCommands,
            env: spec.env,
            hooks,
            signal,
        });
    }

    function registerWorkspace(opened: OpenedWorkspace, hooks: AgentRunHooks): Workspace {
        openWorkspaces.set(opened.id, opened);
        emitSystemEvent(hooks, WORKSPACE_READY_MESSAGE);

        return createDockerWorkspace(opened, {
            commands,
            containers,
            runAgent: (request, agentHooks) =>
                deps.runAgentInContainer(
                    agentContainer(opened.containerId, opened.env),
                    request,
                    agentHooks,
                ),
            closeWorkspace,
        });
    }

    // A container left behind by a crash keeps the workspace's name taken; its worktree is reused.
    function removeLeftoverContainer(workspaceId: string): Promise<void> {
        return containers.stop(workspaceId);
    }

    // After a restart nothing is in memory: the containers are found by label.
    async function removeContainersOf(workspaceId: string): Promise<void> {
        const found = await containers.list({ [WORKSPACE_LABEL]: workspaceId });
        await Promise.all(found.map((container) => containers.stop(container.id)));
    }

    function agentContainer(containerId: string, env: Record<string, string>): AgentContainer {
        return { containerId, containers, env };
    }

    function emitSystemEvent(hooks: AgentRunHooks, message: string): void {
        hooks.onEvent({ kind: "system", message, at: clock.now() });
    }

    return { openWorkspace, runHeadless, closeWorkspace, listOpenWorkspaces };
}

function throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
        throw new AgentCanceledError();
    }
}
