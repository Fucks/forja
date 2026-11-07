import { useState } from "react";
import type { JSX } from "react";
import { Outlet, useParams } from "react-router";

import { Sidebar } from "@/web/app/sidebar.js";
import { Topbar } from "@/web/app/topbar.js";

export function AppShell({ connected = false }: { connected?: boolean }): JSX.Element {
    const { projectId } = useParams();
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    return (
        <div className="flex h-screen">
            <Sidebar
                projectId={projectId}
                isCollapsed={isSidebarCollapsed}
                onCollapsedChange={setIsSidebarCollapsed}
            />
            <div className="flex min-w-0 flex-1 flex-col">
                <Topbar projectId={projectId} connected={connected} />
                <main className="min-h-0 flex-1 overflow-auto p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
