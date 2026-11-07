import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const WEB_DEV_SERVER_PORT = 5317;
const API_SERVER_URL = "http://127.0.0.1:4317";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: { tsconfigPaths: true },
    build: { outDir: "dist/web" },
    server: {
        port: WEB_DEV_SERVER_PORT,
        strictPort: true,
        proxy: { "/api": API_SERVER_URL },
    },
});
