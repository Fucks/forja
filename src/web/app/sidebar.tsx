import type { LucideIcon } from "lucide-react";
import type { JSX } from "react";
import { NavLink } from "react-router";

import { GLOBAL_NAV, PROJECT_NAV, PROJECTS_PATH } from "@/web/config/navigation.js";

export function Sidebar({ projectId }: { projectId: string | undefined }): JSX.Element {
    return (
        <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
            <nav aria-label="Navegação principal" className="flex flex-col gap-4 py-3">
                <ul className="flex flex-col">
                    {GLOBAL_NAV.map((item) => (
                        <li key={item.id}>
                            <SidebarLink label={item.label} icon={item.icon} path={item.path} />
                        </li>
                    ))}
                </ul>
                {projectId && (
                    <ul aria-label="Projeto" className="flex flex-col">
                        {PROJECT_NAV.map((item) => (
                            <li key={item.id}>
                                <SidebarLink
                                    label={item.label}
                                    icon={item.icon}
                                    path={item.path(projectId)}
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </nav>
        </aside>
    );
}

function SidebarLink({
    label,
    icon: Icon,
    path,
}: {
    label: string;
    icon: LucideIcon;
    path: string;
}): JSX.Element {
    return (
        <NavLink
            to={path}
            end={path === PROJECTS_PATH}
            className="flex h-8 items-center gap-2 border-l-2 border-transparent px-4 text-muted hover:text-text aria-[current=page]:border-accent aria-[current=page]:text-text"
        >
            <Icon aria-hidden className="size-4 shrink-0" />
            <span>{label}</span>
        </NavLink>
    );
}
