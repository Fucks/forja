import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";

import { createAppRouter } from "@/web/app/routes.js";
import "@/web/styles/global.css";

const ROOT_ELEMENT_ID = "root";

const rootElement = document.getElementById(ROOT_ELEMENT_ID);
if (!rootElement) {
    throw new Error(`Elemento #${ROOT_ELEMENT_ID} não encontrado em index.html.`);
}

createRoot(rootElement).render(
    <StrictMode>
        <RouterProvider router={createAppRouter()} />
    </StrictMode>,
);
