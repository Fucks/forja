import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { DataRouter } from "react-router";

import { createTestQueryClient } from "@/test/render_with_query_client.js";
import { APP_ROUTES } from "@/web/app/routes.js";
import { ToastProvider } from "@/web/components/ui/toast.js";

export function renderAppAt(path: string): DataRouter {
    const router = createMemoryRouter(APP_ROUTES, { initialEntries: [path] });
    render(
        <QueryClientProvider client={createTestQueryClient()}>
            <ToastProvider>
                <RouterProvider router={router} />
            </ToastProvider>
        </QueryClientProvider>,
    );

    return router;
}
