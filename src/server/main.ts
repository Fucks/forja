import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { AppDeps } from "@/server/app.js";
import { openDatabase } from "@/server/db/client.js";
import type { DatabaseHandle } from "@/server/db/client.js";

const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

export type ServerDeps = Omit<AppDeps, "db">;

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
    try {
        const app = await buildApp({ ...deps, db: database.db });
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
