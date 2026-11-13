import * as fs from "node:fs";

import type { FastifyInstance } from "fastify";

import type { AgentRuntime } from "@/integrations/agent_runtime/agent_runtime.js";
import { createDockerAgentRuntime } from "@/integrations/agent_runtime/docker_agent_runtime.js";
import { createScriptedAgentRuntime } from "@/integrations/agent_runtime/scripted_agent_runtime.js";
import { currentHostUser } from "@/integrations/agent_runtime/workspace_layout.js";
import { CliGitProvider } from "@/integrations/git/cli_git_provider.js";
import type { CommandRunner } from "@/integrations/process/command_runner.js";
import { ExecaCommandRunner } from "@/integrations/process/execa_command_runner.js";
import { loadOrCreateMasterKey } from "@/integrations/secrets/master_key.js";
import { createSecretBox } from "@/integrations/secrets/secret_box.js";
import { createSecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import { assertNever } from "@/lib/assert_never.js";
import { systemClock } from "@/lib/clock.js";
import { buildApp } from "@/server/app.js";
import type { AppDeps, ServerOptions } from "@/server/app.js";
import { openDatabase } from "@/server/db/client.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { seedDemo } from "@/server/demo/seed_demo.js";
import type { AppServices } from "@/server/demo/seed_demo.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import { createAppExecutor } from "@/server/runtime/app_executor.js";
import { createEventBus } from "@/server/runtime/event_bus.js";
import type { Executor } from "@/server/runtime/executor.js";
import { createLogStore } from "@/server/runtime/log_store.js";
import { recoverRuns } from "@/server/runtime/recovery.js";
import { createSessionProtection } from "@/server/security/api_protection.js";

const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

export type ServerDeps = Omit<
    AppDeps,
    | "db"
    | "events"
    | "commands"
    | "git"
    | "secrets"
    | "redactor"
    | "logs"
    | "agentRuntime"
    | "executor"
    | "apiProtection"
>;

export async function startServer(deps: ServerDeps): Promise<FastifyInstance> {
    const database = openDatabase(deps.paths.database);
    const app = await buildAppOwningDatabase(deps, database);
    closeOnShutdownSignals(app);

    await app.listen({ host: deps.env.FORJA_HOST, port: deps.env.FORJA_PORT });

    return app;
}

async function buildAppOwningDatabase(
    deps: ServerDeps,
    database: DatabaseHandle,
): Promise<FastifyInstance> {
    const commands = new ExecaCommandRunner();
    const events = createEventBus(systemClock);
    const git = new CliGitProvider(commands);
    const redactor = createSecretRedactor();
    const secrets = createSecretBox(loadOrCreateMasterKey(deps.paths.masterKey, fs));
    const logs = createLogStore({
        logsDir: deps.paths.logs,
        db: database.db,
        redactor,
        clock: systemClock,
    });
    const services: AppServices = {
        db: database.db,
        events,
        logs,
        git,
        commands,
        secrets,
        redactor,
        clock: systemClock,
    };
    const agentRuntime = createAgentRuntime(deps, commands);
    const executor = createAppExecutor({ ...services, runtime: agentRuntime });
    try {
        await recoverRunsOfPreviousProcess(database, executor, agentRuntime);
        await seedDemoIfRequested(deps.options, services);
        const app = await buildApp({
            ...deps,
            db: database.db,
            events,
            commands,
            git,
            secrets,
            redactor,
            logs,
            agentRuntime,
            executor,
            apiProtection: createSessionProtection(deps.env),
        });
        app.addHook("onClose", (_closingApp, done) => {
            database.close();
            done();
        });
        return app;
    } catch (error) {
        database.close();
        throw error;
    }
}

function createAgentRuntime({ env, paths }: ServerDeps, commands: CommandRunner): AgentRuntime {
    switch (env.FORJA_AGENT_RUNTIME) {
        case "docker":
            return createDockerAgentRuntime({
                commands,
                paths,
                clock: systemClock,
                hostUser: currentHostUser(),
            });
        case "fake":
            return createScriptedAgentRuntime({ clock: systemClock });
        default:
            return assertNever(env.FORJA_AGENT_RUNTIME);
    }
}

// Before the routes exist, so no request sees a run still active from the previous process.
async function recoverRunsOfPreviousProcess(
    database: DatabaseHandle,
    executor: Executor,
    runtime: AgentRuntime,
): Promise<void> {
    await recoverRuns({
        runs: new SqliteRunRepository(database.db, systemClock),
        executor,
        runtime,
        clock: systemClock,
        log: (message) => console.log(message),
    });
}

async function seedDemoIfRequested(options: ServerOptions, services: AppServices): Promise<void> {
    if (!options.seedDemo) {
        return;
    }

    const seeded = await seedDemo(services);
    const outcome = seeded.created ? "criado" : "já existia";
    console.log(`Projeto de demonstração ${outcome}: ${seeded.projectId}`);
}

function closeOnShutdownSignals(app: FastifyInstance): void {
    for (const signal of SHUTDOWN_SIGNALS) {
        process.once(signal, () => {
            void closeServer(app);
        });
    }
}

async function closeServer(app: FastifyInstance): Promise<void> {
    try {
        await app.close();
    } catch (error) {
        app.log.error(error, "Falha ao encerrar o servidor");
        process.exitCode = 1;
    }
}
