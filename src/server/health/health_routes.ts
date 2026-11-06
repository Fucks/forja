import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import type { RouteModule } from "@/server/route_modules.js";

import packageJson from "../../../package.json" with { type: "json" };

const healthResponseSchema = z.object({
    status: z.literal("ok"),
    version: z.string(),
    dataDir: z.string(),
});

type HealthResponse = z.infer<typeof healthResponseSchema>;

export const registerHealthRoutes: RouteModule = (app, deps) => {
    app.withTypeProvider<ZodTypeProvider>().get(
        "/health",
        { schema: { response: { 200: healthResponseSchema } } },
        (): HealthResponse => ({
            status: "ok",
            version: packageJson.version,
            dataDir: deps.paths.root,
        }),
    );
};
