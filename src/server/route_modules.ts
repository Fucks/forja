// Closed list: every MVP route module is imported here up front so parallel issues never edit this
// file. The issue that owns a module replaces the content of its stub instead.
//
// Background work of a domain (sync, cron, cleanup) is started by its own route module with
// app.addHook("onReady", ...) and stopped with app.addHook("onClose", ...), so main.ts never changes
// for it.
import type { FastifyInstance } from "fastify";

import type { AppDeps } from "@/server/app.js";
import { registerAgentImagesRoutes } from "@/server/agent_images/agent_images_routes.js";
import { registerApprovalsRoutes } from "@/server/approvals/approvals_routes.js";
import { registerCredentialsRoutes } from "@/server/credentials/credentials_routes.js";
import { registerDiagnosticsRoutes } from "@/server/diagnostics/diagnostics_routes.js";
import { registerEventsRoutes } from "@/server/events/events_routes.js";
import { registerFlowsRoutes } from "@/server/flows/flows_routes.js";
import { registerHealthRoutes } from "@/server/health/health_routes.js";
import { registerProjectsRoutes } from "@/server/projects/projects_routes.js";
import { registerLogsRoutes } from "@/server/runs/logs_routes.js";
import { registerRunsRoutes } from "@/server/runs/runs_routes.js";
import { registerSettingsRoutes } from "@/server/settings/settings_routes.js";
import { registerStaticRoutes } from "@/server/static/static_routes.js";
import { registerToolProfilesRoutes } from "@/server/tool_profiles/tool_profiles_routes.js";
import { registerTriggersRoutes } from "@/server/triggers/triggers_routes.js";
import { registerWebhookRoutes } from "@/server/triggers/webhook_routes.js";
import { registerUsageRoutes } from "@/server/usage/usage_routes.js";
import { registerWorkItemsRoutes } from "@/server/work_items/work_items_routes.js";

export type RouteModule = (app: FastifyInstance, deps: AppDeps) => Promise<void> | void;

// The static module serves the SPA fallback, so it must stay last.
export const routeModules: RouteModule[] = [
    registerHealthRoutes,
    registerEventsRoutes,
    registerProjectsRoutes,
    registerCredentialsRoutes,
    registerDiagnosticsRoutes,
    registerToolProfilesRoutes,
    registerSettingsRoutes,
    registerFlowsRoutes,
    registerRunsRoutes,
    registerLogsRoutes,
    registerUsageRoutes,
    registerAgentImagesRoutes,
    registerWorkItemsRoutes,
    registerTriggersRoutes,
    registerWebhookRoutes,
    registerApprovalsRoutes,
    registerStaticRoutes,
];
