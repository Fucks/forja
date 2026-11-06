import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { AppDeps } from "@/server/app.js";

const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

export async function startServer(deps: AppDeps): Promise<FastifyInstance> {
    const app = await buildApp(deps);
    closeOnShutdownSignals(app);

    await app.listen({ host: deps.env.FORJA_HOST, port: deps.env.FORJA_PORT });

    return app;
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
