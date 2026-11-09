import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { systemClock } from "@/lib/clock.js";
import { DIAGNOSTIC_CHECKS } from "@/server/diagnostics/diagnostic_checks.js";
import { createDiagnosticService } from "@/server/diagnostics/diagnostic_service.js";
import type { RouteModule } from "@/server/route_modules.js";

const DIAGNOSTICS_PATH = "/diagnostics";
const FORCE_FLAG = "1";

const diagnosticsQuerySchema = z.object({ force: z.literal(FORCE_FLAG).optional() });

export const registerDiagnosticsRoutes: RouteModule = (app, deps) => {
    const diagnostics = createDiagnosticService({
        checks: DIAGNOSTIC_CHECKS,
        commands: deps.commands,
        clock: systemClock,
    });

    app.withTypeProvider<ZodTypeProvider>().get(
        DIAGNOSTICS_PATH,
        { schema: { querystring: diagnosticsQuerySchema } },
        (request) => diagnostics.run(request.query.force === FORCE_FLAG),
    );
};
