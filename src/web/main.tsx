import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";

import { queryClient } from "@/web/api/query_client.js";
import { createAppRouter } from "@/web/app/routes.js";
import "@/web/styles/global.css";

const ROOT_ELEMENT_ID = "root";

const rootElement = document.getElementById(ROOT_ELEMENT_ID);
if (!rootElement) {
    throw new Error(`Elemento #${ROOT_ELEMENT_ID} não encontrado em index.html.`);
}

createRoot(rootElement).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <RouterProvider router={createAppRouter()} />
        </QueryClientProvider>
    </StrictMode>,
);
