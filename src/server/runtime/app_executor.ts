import { existsSync } from "node:fs";

import type { AgentRuntime } from "@/integrations/agent_runtime/agent_runtime.js";
import type { GitProvider } from "@/integrations/git/git_provider.js";
import type { CommandRunner } from "@/integrations/process/command_runner.js";
import type { SecretBox } from "@/integrations/secrets/secret_box.js";
import type { SecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import type { Clock } from "@/lib/clock.js";
import { newId } from "@/lib/ids.js";
import type { ForjaDb } from "@/server/db/client.js";
import { createAppFlowService } from "@/server/flows/app_flow_service.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createProjectService } from "@/server/projects/project_service.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import { createExecutor, type Executor, type ItemSource } from "@/server/runtime/executor.js";
import type { LogStore } from "@/server/runtime/log_store.js";
import { createNodeExecutors } from "@/server/runtime/node_executors.js";
import { createSettingsLookups } from "@/server/settings/settings_lookups.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { createSettingsService } from "@/server/settings/settings_service.js";
import { createAppUsageService } from "@/server/usage/app_usage_service.js";
import { createGithubOfProject } from "@/server/work_items/project_github_provider.js";
import { WorkItemRepository } from "@/server/work_items/work_item_repository.js";
import {
    createWorkItemService,
    type WorkItemService,
} from "@/server/work_items/work_item_service.js";

export interface AppExecutorDeps {
    db: ForjaDb;
    events: EventBus;
    logs: LogStore;
    git: GitProvider;
    commands: CommandRunner;
    secrets: SecretBox;
    redactor: SecretRedactor;
    runtime: AgentRuntime;
    clock: Clock;
}

// The executor of the app, over the same database and event bus as the routes.
export function createAppExecutor({
    db,
    events,
    logs,
    git,
    commands,
    secrets,
    redactor,
    runtime,
    clock,
}: AppExecutorDeps): Executor {
    const runs = new SqliteRunRepository(db, clock);
    const projects = createProjectService({
        repo: new ProjectRepository(db),
        git,
        fileExists: existsSync,
        clock,
    });
    const workItems = createWorkItemService({ repo: new WorkItemRepository(db), events, clock });
    const settings = createSettingsService({
        repo: new SettingsRepository(db),
        lookups: createSettingsLookups(db),
        clock,
    });

    return createExecutor({
        runs,
        flows: createAppFlowService({ db, events, clock }),
        projects,
        settings,
        items: createItemSource(workItems),
        runtime,
        events,
        logs,
        usage: createAppUsageService({ db, settings, clock }),
        clock,
        newId,
        nodeExecutors: createNodeExecutors({
            workItems,
            runs,
            projects,
            clock,
            githubOf: createGithubOfProject({ db, commands, secrets, redactor, clock }),
        }),
    });
}

function createItemSource(workItems: WorkItemService): ItemSource {
    return { getItems: (projectId, ids) => workItems.snapshots(projectId, ids) };
}
