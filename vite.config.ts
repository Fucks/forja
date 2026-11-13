import type { ServerResponse } from "node:http";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Logger, type Plugin } from "vite";

const WEB_DEV_SERVER_PORT = 5317;
const API_SERVER_URL = "http://127.0.0.1:4317";
// Served by the API server only in development (src/server/security/dev_session_route.ts).
const DEV_SESSION_URL = `${API_SERVER_URL}/session`;
const HTML_MEDIA_TYPE = "text/html";

export default defineConfig({
    plugins: [react(), tailwindcss(), handOutApiSessionCookie()],
    resolve: { tsconfigPaths: true },
    build: { outDir: "dist/web" },
    server: {
        port: WEB_DEV_SERVER_PORT,
        strictPort: true,
        proxy: { "/api": API_SERVER_URL },
    },
});

// In production the API server hands the session cookie out with index.html; here Vite serves
// the page, so it asks the API server for the cookie and hands it out in its place.
function handOutApiSessionCookie(): Plugin {
    return {
        name: "forja-api-session-cookie",
        apply: "serve",
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                if (!request.headers.accept?.includes(HTML_MEDIA_TYPE)) {
                    next();
                    return;
                }

                void copyApiSessionCookie(response, server.config.logger).finally(next);
            });
        },
    };
}

async function copyApiSessionCookie(response: ServerResponse, logger: Logger): Promise<void> {
    try {
        const devSession = await fetch(DEV_SESSION_URL);
        response.setHeader("set-cookie", devSession.headers.getSetCookie());
    } catch {
        logger.warn("O servidor da Forja ainda não respondeu; recarregue a página em instantes.");
    }
}
