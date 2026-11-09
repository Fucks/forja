import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import type { DiagnosticItem, DiagnosticReport } from "@/shared/diagnostic_types.js";
import { stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import { renderAppAt } from "@/test/render_app_at.js";

const DIAGNOSTICS_PAGE_PATH = "/settings/diagnostics";
const CHECKED_AT = "2026-06-01T10:00:00.000Z";

const NODE_OK: DiagnosticItem = {
    id: "node",
    label: "Node.js",
    status: "ok",
    detail: "Node 22.11.0",
};
const GIT_OK: DiagnosticItem = {
    id: "git",
    label: "git",
    status: "ok",
    detail: "git version 2.47.1",
};
const DOCKER_STOPPED: DiagnosticItem = {
    id: "docker",
    label: "Docker",
    status: "error",
    detail: "Docker instalado mas não está rodando",
    fix: "Abra o Docker Desktop (ou inicie o serviço docker) e verifique de novo",
};
const GIT_TIMED_OUT: DiagnosticItem = {
    id: "git",
    label: "git",
    status: "error",
    detail: "git --version não respondeu em 10 s",
};
const GH_UNAUTHENTICATED: DiagnosticItem = {
    id: "gh-auth",
    label: "Autenticação do gh",
    status: "warning",
    detail: "PRs e issues do GitHub não vão funcionar",
    fix: "Rode gh auth login",
};

function buildReport(items: DiagnosticItem[]): DiagnosticReport {
    return { checkedAt: CHECKED_AT, items };
}

async function findDiagnosticItem(label: string): Promise<HTMLElement> {
    return screen.findByRole("listitem", { name: label });
}

describe("DiagnosticsPage", () => {
    it("says everything is ready when every item is ok", async () => {
        stubFetchRoutes({
            "GET /api/diagnostics": () => Response.json(buildReport([NODE_OK, GIT_OK])),
        });

        renderAppAt(DIAGNOSTICS_PAGE_PATH);

        expect(await screen.findByText("Tudo pronto para rodar agentes")).toBeInTheDocument();
        expect(within(await findDiagnosticItem("Node.js")).getByText("OK")).toBeInTheDocument();
    });

    it("counts the errors that prevent running agents", async () => {
        const report = buildReport([NODE_OK, GIT_TIMED_OUT, DOCKER_STOPPED, GH_UNAUTHENTICATED]);
        stubFetchRoutes({ "GET /api/diagnostics": () => Response.json(report) });

        renderAppAt(DIAGNOSTICS_PAGE_PATH);

        expect(await screen.findByText("2 problemas impedem rodar agentes")).toBeInTheDocument();
    });

    it("mentions the warnings when nothing prevents running agents", async () => {
        const report = buildReport([NODE_OK, GH_UNAUTHENTICATED]);
        stubFetchRoutes({ "GET /api/diagnostics": () => Response.json(report) });

        renderAppAt(DIAGNOSTICS_PAGE_PATH);

        expect(
            await screen.findByText("Pronto para rodar agentes, com 1 aviso"),
        ).toBeInTheDocument();
    });

    it("shows each failing item with its status, detail in mono and how to fix it", async () => {
        stubFetchRoutes({
            "GET /api/diagnostics": () => Response.json(buildReport([DOCKER_STOPPED])),
        });

        renderAppAt(DIAGNOSTICS_PAGE_PATH);

        const docker = await findDiagnosticItem("Docker");
        expect(within(docker).getByText("Erro")).toBeInTheDocument();
        expect(within(docker).getByText("Docker instalado mas não está rodando")).toHaveClass(
            "font-mono",
        );
        expect(within(docker).getByText("Como resolver")).toBeInTheDocument();
        expect(within(docker).getByText(DOCKER_STOPPED.fix ?? "")).toBeInTheDocument();
    });

    it("checks again bypassing the cache when asked to verify again", async () => {
        const user = userEvent.setup();
        stubFetchRoutes({
            "GET /api/diagnostics": () => Response.json(buildReport([DOCKER_STOPPED])),
            "GET /api/diagnostics?force=1": () => Response.json(buildReport([NODE_OK])),
        });
        renderAppAt(DIAGNOSTICS_PAGE_PATH);
        await findDiagnosticItem("Docker");

        await user.click(screen.getByRole("button", { name: "Verificar de novo" }));

        await waitFor(() =>
            expect(screen.getByText("Tudo pronto para rodar agentes")).toBeInTheDocument(),
        );
        expect(screen.queryByRole("listitem", { name: "Docker" })).not.toBeInTheDocument();
    });
});
