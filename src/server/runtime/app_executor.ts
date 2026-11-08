import { existsSync } from "node:fs";

import type { AgentRuntime } from "@/integrations/agent_runtime/agent_runtime.js";
import type { GitProvider } from "@/integrations/git/git_provider.js";
import type { Clock } from "@/lib/clock.js";
import { newId } from "@/lib/ids.js";
import { CredentialRepository } from "@/server/credentials/credential_repository.js";
import type { ForjaDb } from "@/server/db/client.js";
import { FlowRepository } from "@/server/flows/flow_repository.js";
import { createFlowService } from "@/server/flows/flow_service.js";
import { buildValidationContext } from "@/server/flows/flows_routes.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { createProjectService } from "@/server/projects/project_service.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import type { EventBus } from "@/server/runtime/event_bus.js";
import { createExecutor, type Executor, type ItemSource } from "@/server/runtime/executor.js";
import { createSettingsLookups } from "@/server/settings/settings_lookups.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { createSettingsService } from "@/server/settings/settings_service.js";
import { WorkItemRepository } from "@/server/work_items/work_item_repository.js";
import { createWorkItemService } from "@/server/work_items/work_item_service.js";

export interface AppExecutorDeps {
    db: ForjaDb;
    events: EventBus;
    git: GitProvider;
    runtime: AgentRuntime;
    clock: Clock;
}

// The executor of the app, over the same database and event bus as the routes.
export function createAppExecutor({ db, events, git, runtime, clock }: AppExecutorDeps): Executor {
    const credentials = new CredentialRepository(db);

    return createExecutor({
        runs: new SqliteRunRepository(db, clock),
        flows: createFlowService({
            repo: new FlowRepository(db),
            events,
            clock,
            validationContext: () => buildValidationContext(credentials),
        }),
        projects: createProjectService({
            repo: new ProjectRepository(db),
            git,
            fileExists: existsSync,
            clock,
        }),
        settings: createSettingsService({
            repo: new SettingsRepository(db),
            lookups: createSettingsLookups(db),
            clock,
        }),
        items: createItemSource(db, events, clock),
        runtime,
        events,
        clock,
        newId,
    });
}

function createItemSource(db: ForjaDb, events: EventBus, clock: Clock): ItemSource {
    const workItems = createWorkItemService({ repo: new WorkItemRepository(db), events, clock });

    return { getItems: (projectId, ids) => workItems.snapshots(projectId, ids) };
}
