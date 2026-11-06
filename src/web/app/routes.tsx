import { createBrowserRouter } from "react-router";
import type { DataRouter } from "react-router";

import { HomePage } from "@/web/app/home_page.js";

export function createAppRouter(): DataRouter {
    return createBrowserRouter([{ path: "/", element: <HomePage /> }]);
}
