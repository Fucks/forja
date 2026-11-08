import * as fs from "node:fs";

import type { FastifyInstance } from "fastify";

import { UnavailableAgentRuntime } from "@/integrations/agent_runtime/unavailable_agent_runtime.js";
import { CliGitProvider } from "@/integrations/git/cli_git_provider.js";
import { ExecaCommandRunner } from "@/integrations/process/execa_command_runner.js";
import { loadOrCreateMasterKey } from "@/integrations/secrets/master_key.js";
import { createSecretBox } from "@/integrations/secrets/secret_box.js";
import { createSecretRedactor } from "@/integrations/secrets/secret_redactor.js";
import { systemClock } from "@/lib/clock.js";
import { buildApp } from "@/server/app.js";
import type { AppDeps } from "@/server/app.js";
import { openDatabase } from "@/server/db/client.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { createAppExecutor } from "@/server/runtime/app_executor.js";
import { createEventBus } from "@/server/runtime/event_bus.js";

const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

export type ServerDeps = Omit<
    AppDeps,
    "db" | "events" | "commands" | "git" | "secrets" | "redactor" | "agentRuntime" | "executor"
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
    // TODO(#58): use the Docker runtime; #71 adds the demo runtime for --seed-demo.
    const agentRuntime = new UnavailableAgentRuntime();
    try {
        const app = await buildApp({
            ...deps,
            db: database.db,
            events,
            commands,
            git,
            secrets: createSecretBox(loadOrCreateMasterKey(deps.paths.masterKey, fs)),
            redactor: createSecretRedactor(),
            agentRuntime,
            executor: createAppExecutor({
                db: database.db,
                events,
                git,
                runtime: agentRuntime,
                clock: systemClock,
            }),
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
