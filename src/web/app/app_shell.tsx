import { useState } from "react";
import type { JSX } from "react";
import { Outlet, useParams } from "react-router";

import { Sidebar } from "@/web/app/sidebar.js";
import { Topbar } from "@/web/app/topbar.js";
import { useMediaQuery } from "@/web/app/use_media_query.js";

const NARROW_VIEWPORT_QUERY = "(max-width: 1023px)";

export function AppShell({ connected = false }: { connected?: boolean }): JSX.Element {
    const { projectId } = useParams();
    const [isSidebarCollapsedByUser, setIsSidebarCollapsedByUser] = useState(false);
    const isViewportNarrow = useMediaQuery(NARROW_VIEWPORT_QUERY);

    return (
        <div className="flex h-screen">
            <Sidebar
                projectId={projectId}
                isCollapsed={isViewportNarrow || isSidebarCollapsedByUser}
                isCollapseLocked={isViewportNarrow}
                onCollapsedChange={setIsSidebarCollapsedByUser}
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
