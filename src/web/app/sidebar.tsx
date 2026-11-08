import { clsx } from "clsx";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { JSX } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";

import { useProjects } from "@/web/app/projects/use_projects.js";
import { Field } from "@/web/components/ui/field.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { Select } from "@/web/components/ui/select.js";
import { Tooltip } from "@/web/components/ui/tooltip.js";
import {
    GLOBAL_NAV,
    PROJECT_NAV,
    PROJECTS_PATH,
    switchProjectPath,
} from "@/web/config/navigation.js";
import type { GlobalNavItem } from "@/web/config/navigation.js";

export function Sidebar({
    projectId,
    isCollapsed,
    isCollapseLocked,
    onCollapsedChange,
}: {
    projectId: string | undefined;
    isCollapsed: boolean;
    isCollapseLocked: boolean;
    onCollapsedChange: (isCollapsed: boolean) => void;
}): JSX.Element {
    return (
        <aside
            className={clsx(
                "flex shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-150 ease-out",
                isCollapsed ? "w-14" : "w-60",
            )}
        >
            <div className="flex h-11 items-center justify-end border-b border-border px-3">
                {!isCollapseLocked && (
                    <IconButton
                        label={isCollapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
                        icon={isCollapsed ? PanelLeftOpen : PanelLeftClose}
                        aria-expanded={!isCollapsed}
                        onClick={() => onCollapsedChange(!isCollapsed)}
                    />
                )}
            </div>
            {!isCollapsed && <ProjectSwitcher projectId={projectId} />}
            <nav aria-label="Navegação principal" className="flex flex-col gap-4 py-3">
                <SidebarLinkList links={GLOBAL_NAV} isCollapsed={isCollapsed} />
                {projectId && (
                    <SidebarLinkList
                        label="Projeto"
                        links={listProjectLinks(projectId)}
                        isCollapsed={isCollapsed}
                    />
                )}
            </nav>
        </aside>
    );
}

function ProjectSwitcher({ projectId }: { projectId: string | undefined }): JSX.Element | null {
    const projectsQuery = useProjects();
    const { pathname } = useLocation();
    const navigate = useNavigate();

    if (!projectsQuery.data || projectsQuery.data.length === 0) {
        return null;
    }

    const projectOptions = projectsQuery.data.map((project) => ({
        value: project.id,
        label: project.name,
    }));
    const openProject = (nextProjectId: string): void => {
        void navigate(switchProjectPath(pathname, nextProjectId));
    };

    return (
        <div className="border-b border-border px-3 py-3">
            <Field label="Projeto" htmlFor="sidebar-project-switcher">
                <Select
                    value={projectId ?? ""}
                    onChange={openProject}
                    options={projectOptions}
                    placeholder="Selecionar projeto"
                />
            </Field>
        </div>
    );
}

type SidebarLinkTarget = GlobalNavItem;

function listProjectLinks(projectId: string): SidebarLinkTarget[] {
    return PROJECT_NAV.map((item) => ({ ...item, path: item.path(projectId) }));
}

function SidebarLinkList({
    label,
    links,
    isCollapsed,
}: {
    label?: string;
    links: SidebarLinkTarget[];
    isCollapsed: boolean;
}): JSX.Element {
    return (
        <ul aria-label={label} className="flex flex-col">
            {links.map((link) => (
                <li key={link.id}>
                    <SidebarLink link={link} isCollapsed={isCollapsed} />
                </li>
            ))}
        </ul>
    );
}

function SidebarLink({
    link,
    isCollapsed,
}: {
    link: SidebarLinkTarget;
    isCollapsed: boolean;
}): JSX.Element {
    const { label, icon: Icon, path } = link;
    const navLink = (
        <NavLink
            to={path}
            end={path === PROJECTS_PATH}
            aria-label={isCollapsed ? label : undefined}
            className="flex h-8 items-center gap-2 border-l-2 border-transparent px-4.5 text-muted outline-none hover:text-text focus-visible:bg-surface-raised aria-[current=page]:border-accent aria-[current=page]:text-text"
        >
            <Icon aria-hidden className="size-4 shrink-0" />
            {!isCollapsed && <span className="truncate">{label}</span>}
        </NavLink>
    );

    if (!isCollapsed) {
        return navLink;
    }

    return <Tooltip content={label}>{navLink}</Tooltip>;
}
