import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { systemClock } from "@/lib/clock.js";
import { BYTES_PER_MB } from "@/lib/format.js";
import { createAgentImageLookups } from "@/server/agent_images/agent_image_lookups.js";
import type { AgentImageLookups } from "@/server/agent_images/agent_image_lookups.js";
import {
    createAgentImageCheck,
    createForjaDiskUsageCheck,
    DIAGNOSTIC_CHECKS,
} from "@/server/diagnostics/diagnostic_checks.js";
import type { DiagnosticCheck, ForjaDiskUsage } from "@/server/diagnostics/diagnostic_checks.js";
import { createDiagnosticService } from "@/server/diagnostics/diagnostic_service.js";
import type { RouteModule } from "@/server/route_modules.js";
import type { LogStore } from "@/server/runtime/log_store.js";
import { createSettingsLookups } from "@/server/settings/settings_lookups.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { createSettingsService } from "@/server/settings/settings_service.js";
import type { SettingsService } from "@/server/settings/settings_service.js";

const DIAGNOSTICS_PATH = "/diagnostics";
const FORCE_FLAG = "1";

const diagnosticsQuerySchema = z.object({ force: z.literal(FORCE_FLAG).optional() });

export const registerDiagnosticsRoutes: RouteModule = (app, deps) => {
    const agentImages = createAgentImageLookups(deps.db);
    const settings = createSettingsService({
        repo: new SettingsRepository(deps.db),
        lookups: createSettingsLookups(deps.db),
        clock: systemClock,
    });
    const diskUsageCheck = createForjaDiskUsageCheck(() => readForjaDiskUsage(deps.logs, settings));
    const diagnostics = createDiagnosticService({
        listChecks: () => [...listChecks(agentImages), diskUsageCheck],
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

async function readForjaDiskUsage(
    logs: LogStore,
    settings: SettingsService,
): Promise<ForjaDiskUsage> {
    const [runLogSizes, globalSettings] = await Promise.all([
        logs.listRunLogSizes(),
        settings.getGlobalSettings(),
    ]);

    return {
        logsBytes: runLogSizes.reduce((total, { bytes }) => total + bytes, 0),
        maxLogsBytes: globalSettings.logMaxTotalMb * BYTES_PER_MB,
    };
}
