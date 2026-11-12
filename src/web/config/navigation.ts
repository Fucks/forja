import {
    ClipboardCheck,
    FolderKanban,
    Gauge,
    History,
    KeyRound,
    Settings,
    SquareKanban,
    Stethoscope,
    Workflow,
    Wrench,
    Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { matchPath } from "react-router";

export interface NavItem {
    id: string;
    label: string;
    icon: LucideIcon;
    path: (projectId: string) => string;
}

export interface GlobalNavItem {
    id: string;
    label: string;
    icon: LucideIcon;
    path: string;
}

export const PROJECTS_PATH = "/";

const PROJECT_AREA_PATTERN = "/projects/:projectId/:areaId/*";

const TRIGGERS_AREA = projectArea({ id: "triggers", label: "Gatilhos", icon: Zap });

export const PROJECT_NAV: NavItem[] = [
    projectArea({ id: "flows", label: "Fluxos", icon: Workflow }),
    projectArea({ id: "board", label: "Board", icon: SquareKanban }),
    projectArea({ id: "runs", label: "Runs", icon: History }),
    projectArea({ id: "usage", label: "Uso", icon: Gauge }),
    TRIGGERS_AREA,
    projectArea({ id: "approvals", label: "Aprovações", icon: ClipboardCheck }),
    projectArea({ id: "settings", label: "Configurações", icon: Settings }),
];

export const GLOBAL_NAV: GlobalNavItem[] = [
    { id: "projects", label: "Projetos", icon: FolderKanban, path: PROJECTS_PATH },
    { id: "credentials", label: "Credenciais", icon: KeyRound, path: "/settings/credentials" },
    { id: "tool-profiles", label: "Ferramentas", icon: Wrench, path: "/settings/tool-profiles" },
    { id: "diagnostics", label: "Diagnóstico", icon: Stethoscope, path: "/settings/diagnostics" },
];

export function projectPath(projectId: string): string {
    return `/projects/${encodeURIComponent(projectId)}`;
}

export function flowEditorPath(projectId: string, flowId: string): string {
    return `${projectPath(projectId)}/flows/${encodeURIComponent(flowId)}`;
}

export function flowVersionsPath(projectId: string, flowId: string): string {
    return `${flowEditorPath(projectId, flowId)}/versions`;
}

export function triggersPath(projectId: string): string {
    return TRIGGERS_AREA.path(projectId);
}

export function switchProjectPath(currentPathname: string, projectId: string): string {
    const currentArea = findProjectArea(currentPathname);
    if (!currentArea) {
        return projectPath(projectId);
    }

    return currentArea.path(projectId);
}

function findProjectArea(pathname: string): NavItem | undefined {
    const areaId = matchPath(PROJECT_AREA_PATTERN, pathname)?.params.areaId;
    return PROJECT_NAV.find((area) => area.id === areaId);
}

function projectArea(area: Omit<NavItem, "path">): NavItem {
    return { ...area, path: (projectId) => `${projectPath(projectId)}/${area.id}` };
}
