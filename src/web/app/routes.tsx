import { createBrowserRouter } from "react-router";
import type { DataRouter, RouteObject } from "react-router";

import { AppShell } from "@/web/app/app_shell.js";
import { ApprovalsPage } from "@/web/app/approvals/approvals_page.js";
import { BoardPage } from "@/web/app/board/board_page.js";
import { FlowEditorPage } from "@/web/app/flows/flow_editor_page.js";
import { FlowsPage } from "@/web/app/flows/flows_page.js";
import { VersionsPage } from "@/web/app/flows/versions_page.js";
import { NotFoundPage } from "@/web/app/not_found_page.js";
import { ProjectPage } from "@/web/app/projects/project_page.js";
import { ProjectSettingsPage } from "@/web/app/projects/project_settings_page.js";
import { ProjectsPage } from "@/web/app/projects/projects_page.js";
import { RunPage } from "@/web/app/runs/run_page.js";
import { RunsPage } from "@/web/app/runs/runs_page.js";
import { CredentialsPage } from "@/web/app/settings/credentials_page.js";
import { DiagnosticsPage } from "@/web/app/settings/diagnostics_page.js";
import { ToolProfilesPage } from "@/web/app/settings/tool_profiles_page.js";
import { StyleguideCanvasPage } from "@/web/app/styleguide_canvas_page.js";
import { StyleguidePage } from "@/web/app/styleguide_page.js";
import { TriggersPage } from "@/web/app/triggers/triggers_page.js";
import { UsagePage } from "@/web/app/usage/usage_page.js";

const PROJECT_ROUTES: RouteObject[] = [
    { index: true, element: <ProjectPage /> },
    { path: "settings", element: <ProjectSettingsPage /> },
    { path: "flows", element: <FlowsPage /> },
    { path: "flows/:flowId", element: <FlowEditorPage /> },
    { path: "flows/:flowId/versions", element: <VersionsPage /> },
    { path: "board", element: <BoardPage /> },
    { path: "runs", element: <RunsPage /> },
    { path: "runs/:runId", element: <RunPage /> },
    { path: "usage", element: <UsagePage /> },
    { path: "triggers", element: <TriggersPage /> },
    { path: "approvals", element: <ApprovalsPage /> },
];

const GLOBAL_SETTINGS_ROUTES: RouteObject[] = [
    { path: "credentials", element: <CredentialsPage /> },
    { path: "tool-profiles", element: <ToolProfilesPage /> },
    { path: "diagnostics", element: <DiagnosticsPage /> },
];

export const APP_ROUTES: RouteObject[] = [
    {
        element: <AppShell />,
        children: [
            { index: true, element: <ProjectsPage /> },
            { path: "projects/:projectId", children: PROJECT_ROUTES },
            { path: "settings", children: GLOBAL_SETTINGS_ROUTES },
            { path: "styleguide", element: <StyleguidePage /> },
            { path: "styleguide/canvas", element: <StyleguideCanvasPage /> },
            { path: "*", element: <NotFoundPage /> },
        ],
    },
];

export function createAppRouter(): DataRouter {
    return createBrowserRouter(APP_ROUTES);
}
