import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans-condensed/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";

import { queryClient } from "@/web/api/query_client.js";
import { createAppRouter } from "@/web/app/routes.js";
import { ToastProvider } from "@/web/components/ui/toast.js";
import "@/web/styles/global.css";
import { applyTheme, readStoredTheme } from "@/web/styles/theme.js";

const ROOT_ELEMENT_ID = "root";

applyTheme(readStoredTheme(localStorage), document.documentElement, localStorage);

const rootElement = document.getElementById(ROOT_ELEMENT_ID);
if (!rootElement) {
    throw new Error(`Elemento #${ROOT_ELEMENT_ID} não encontrado em index.html.`);
}

createRoot(rootElement).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <ToastProvider>
                <RouterProvider router={createAppRouter()} />
            </ToastProvider>
        </QueryClientProvider>
    </StrictMode>,
);
