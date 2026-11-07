import { useEffect, useState } from "react";
import type { JSX } from "react";

const HEALTH_URL = "/api/health";

type ServerStatus = "checking" | "ok" | "unavailable";

const SERVER_STATUS_LABELS: Record<ServerStatus, string> = {
    checking: "servidor: verificando…",
    ok: "servidor: ok",
    unavailable: "servidor indisponível",
};

export function HomePage(): JSX.Element {
    const serverStatus = useServerStatus();

    return (
        <main>
            <h1>Forja</h1>
            <p>{SERVER_STATUS_LABELS[serverStatus]}</p>
        </main>
    );
}

function useServerStatus(): ServerStatus {
    const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");

    useEffect(() => {
        const abortController = new AbortController();

        async function updateServerStatus(): Promise<void> {
            const currentStatus = await fetchServerStatus(abortController.signal);
            if (!abortController.signal.aborted) {
                setServerStatus(currentStatus);
            }
        }

        void updateServerStatus();

        return () => {
            abortController.abort();
        };
    }, []);

    return serverStatus;
}

async function fetchServerStatus(signal: AbortSignal): Promise<ServerStatus> {
    try {
        const response = await fetch(HEALTH_URL, { signal });
        return response.ok ? "ok" : "unavailable";
    } catch {
        return "unavailable";
    }
}
