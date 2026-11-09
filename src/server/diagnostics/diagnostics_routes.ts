import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { systemClock } from "@/lib/clock.js";
import { createAgentImageLookups } from "@/server/agent_images/agent_image_lookups.js";
import type { AgentImageLookups } from "@/server/agent_images/agent_image_lookups.js";
import {
    createAgentImageCheck,
    DIAGNOSTIC_CHECKS,
} from "@/server/diagnostics/diagnostic_checks.js";
import type { DiagnosticCheck } from "@/server/diagnostics/diagnostic_checks.js";
import { createDiagnosticService } from "@/server/diagnostics/diagnostic_service.js";
import type { RouteModule } from "@/server/route_modules.js";

const DIAGNOSTICS_PATH = "/diagnostics";
const FORCE_FLAG = "1";

const diagnosticsQuerySchema = z.object({ force: z.literal(FORCE_FLAG).optional() });

export const registerDiagnosticsRoutes: RouteModule = (app, deps) => {
    const agentImages = createAgentImageLookups(deps.db);
    const diagnostics = createDiagnosticService({
        listChecks: () => listChecks(agentImages),
        commands: deps.commands,
        clock: systemClock,
    });

    app.withTypeProvider<ZodTypeProvider>().get(
        DIAGNOSTICS_PATH,
        { schema: { querystring: diagnosticsQuerySchema } },
        (request) => diagnostics.run(request.query.force === FORCE_FLAG),
    );
};

function listChecks(agentImages: AgentImageLookups): DiagnosticCheck[] {
    const agentImageChecks = agentImages.listImagesInUse().map(createAgentImageCheck);
    return [...DIAGNOSTIC_CHECKS, ...agentImageChecks];
}
