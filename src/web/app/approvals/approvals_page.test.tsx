import { act, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { MockInstance } from "vitest";

import type { Approval } from "@/shared/approval_types.js";
import type { EventEnvelope } from "@/shared/events.js";
import type { SerializedNodeRunDetail } from "@/shared/run_types.js";
import {
    buildSerializedNodeRun,
    buildSerializedRunView,
} from "@/test/factories/run_view_factory.js";
import { captureBrowserEventSources } from "@/test/fakes/fake_event_source.js";
import { listSentWrites, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import type { FakeRoutes } from "@/test/fakes/fake_fetch.js";
import { renderAppAt } from "@/test/render_app_at.js";

const PROJECT_ID = "prj_forja";
const APPROVALS_PAGE_PATH = `/projects/${PROJECT_ID}/approvals`;
const PENDING_APPROVALS_URL = `/api/projects/${PROJECT_ID}/approvals?status=pending`;
const RESOLVED_APPROVALS_URL = `/api/projects/${PROJECT_ID}/approvals?status=resolved`;
const NOW = new Date("2026-11-12T12:00:00.000Z");
const FIVE_MINUTES_AGO = "2026-11-12T11:55:00.000Z";
const TWO_HOURS_AGO = "2026-11-12T10:00:00.000Z";
const YESTERDAY = "2026-11-11T12:00:00.000Z";

const BRANCH_DIFF = [
    " src/cart.ts | 2 +-",
    " 1 file changed, 1 insertion(+), 1 deletion(-)",
    "",
    "",
    "diff --git a/src/cart.ts b/src/cart.ts",
    "--- a/src/cart.ts",
    "+++ b/src/cart.ts",
    "@@ -1,2 +1,2 @@",
    " const items = [];",
    "-const fee = 1;",
    "+const fee = 2;",
    "diff --git a/README.md b/README.md",
    "--- a/README.md",
    "+++ b/README.md",
    "@@ -1 +1,2 @@",
    " # Forja",
    "+Fábrica de software",
    "",
].join("\n");

const PENDING_APPROVAL: Approval = {
    id: "apv_pendente",
    projectId: PROJECT_ID,
    runId: "run_1",
    nodeRunId: "nr_gate",
    workItemId: "42",
    message: "Revise o diff antes do PR",
    show: ["diff", "artifacts", "logs"],
    diff: BRANCH_DIFF,
    status: "pending",
    createdAt: FIVE_MINUTES_AGO,
};

const OLDER_PENDING_APPROVAL: Approval = {
    ...PENDING_APPROVAL,
    id: "apv_antigo",
    nodeRunId: "nr_gate_antigo",
    workItemId: "41",
    message: "Confirme o push forçado",
    show: [],
    diff: undefined,
    createdAt: TWO_HOURS_AGO,
};

const REJECTED_APPROVAL: Approval = {
    ...PENDING_APPROVAL,
    id: "apv_rejeitado",
    nodeRunId: "nr_gate_rejeitado",
    workItemId: "7",
    message: "Revise a spec",
    show: [],
    diff: undefined,
    status: "rejected",
    comment: "Faltam testes",
    createdAt: YESTERDAY,
    resolvedAt: TWO_HOURS_AGO,
};

const SPEC_NODE_RUN = buildSerializedNodeRun({
    id: "nr_spec",
    runId: "run_1",
    nodeId: "spec",
    workItemId: "42",
    status: "SUCCEEDED",
});

const OTHER_ITEM_NODE_RUN = buildSerializedNodeRun({
    id: "nr_spec_outro",
    runId: "run_1",
    nodeId: "spec",
    workItemId: "43",
    status: "SUCCEEDED",
});

const SPEC_DETAIL: SerializedNodeRunDetail = {
    nodeRun: SPEC_NODE_RUN,
    artifacts: [
        {
            id: "art_spec",
            nodeRunId: SPEC_NODE_RUN.id,
            runId: "run_1",
            name: "spec",
            kind: "json",
            value: { objetivo: "Cobrar taxa de entrega" },
            createdAt: FIVE_MINUTES_AGO,
        },
    ],
};

const RUN_VIEW = buildSerializedRunView({
    nodeRuns: [
        SPEC_NODE_RUN,
        OTHER_ITEM_NODE_RUN,
        buildSerializedNodeRun({
            id: PENDING_APPROVAL.nodeRunId,
            runId: "run_1",
            nodeId: "gate",
            workItemId: "42",
            status: "WAITING_APPROVAL",
        }),
    ],
});

function stubApprovalsApi(routes: FakeRoutes = {}): MockInstance<typeof fetch> {
    return stubFetchRoutes({
        [`GET ${PENDING_APPROVALS_URL}`]: () =>
            Response.json([OLDER_PENDING_APPROVAL, PENDING_APPROVAL]),
        [`GET ${RESOLVED_APPROVALS_URL}`]: () => Response.json([REJECTED_APPROVAL]),
        "GET /api/runs/run_1": () => Response.json(RUN_VIEW),
        "GET /api/node-runs/nr_spec": () => Response.json(SPEC_DETAIL),
        ...routes,
    });
}

function approvalPagePath(nodeRunId: string): string {
    return `${APPROVALS_PAGE_PATH}?nodeRun=${nodeRunId}`;
}

async function findListedApprovals(sectionName: string): Promise<string[]> {
    const section = await screen.findByRole("list", { name: sectionName });

    return within(section)
        .getAllByRole("link")
        .map((link) => link.textContent);
}

async function findDetail(): Promise<HTMLElement> {
    return screen.findByRole("article", { name: "Pedido de aprovação" });
}

function approvalEvent(type: "approval.requested" | "approval.resolved"): EventEnvelope {
    return {
        id: 1,
        at: NOW.toISOString(),
        event: { type, projectId: PROJECT_ID, approvalId: "apv_novo", runId: "run_2" },
    };
}

describe("ApprovalsPage", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("list", () => {
        it("lists the pending approvals with their item and age, then the resolved ones", async () => {
            stubApprovalsApi();

            renderAppAt(APPROVALS_PAGE_PATH);

            expect(await findListedApprovals("Pendentes")).toEqual([
                "Confirme o push forçadoitem #41há 2 h",
                "Revise o diff antes do PRitem #42há 5 min",
            ]);
            expect(await findListedApprovals("Resolvidos")).toEqual([
                "Revise a specitem #7Rejeitado",
            ]);
        });

        it("tells when the project has no approvals", async () => {
            stubApprovalsApi({
                [`GET ${PENDING_APPROVALS_URL}`]: () => Response.json([]),
                [`GET ${RESOLVED_APPROVALS_URL}`]: () => Response.json([]),
            });

            renderAppAt(APPROVALS_PAGE_PATH);

            expect(await screen.findByText("Nenhum pedido de aprovação")).toBeInTheDocument();
        });

        it("opens the first pending approval when none is chosen", async () => {
            stubApprovalsApi();

            renderAppAt(APPROVALS_PAGE_PATH);

            expect(await findDetail()).toHaveTextContent("Confirme o push forçado");
        });

        it("opens the approval clicked in the list", async () => {
            stubApprovalsApi();
            const router = renderAppAt(APPROVALS_PAGE_PATH);

            await userEvent
                .setup()
                .click(await screen.findByRole("link", { name: /Revise o diff antes do PR/ }));

            expect(await findDetail()).toHaveTextContent("Revise o diff antes do PR");
            expect(router.state.location.search).toBe("?nodeRun=nr_gate");
        });

        it("reloads the list when an approval is requested or resolved", async () => {
            const eventSources = captureBrowserEventSources();
            let pendingApprovals: Approval[] = [PENDING_APPROVAL];
            stubApprovalsApi({
                [`GET ${PENDING_APPROVALS_URL}`]: () => Response.json(pendingApprovals),
            });
            renderAppAt(APPROVALS_PAGE_PATH);
            expect(await findListedApprovals("Pendentes")).toHaveLength(1);

            pendingApprovals = [OLDER_PENDING_APPROVAL, PENDING_APPROVAL];
            act(() => {
                for (const source of eventSources.sources) {
                    source.emit(approvalEvent("approval.requested"));
                }
            });

            await waitFor(async () =>
                expect(await findListedApprovals("Pendentes")).toHaveLength(2),
            );
        });
    });

    describe("detail", () => {
        it("shows the gate message, the item and that it waits for approval", async () => {
            stubApprovalsApi();

            renderAppAt(approvalPagePath(PENDING_APPROVAL.nodeRunId));

            const detail = await findDetail();
            expect(within(detail).getByRole("heading", { name: "Revise o diff antes do PR" }));
            expect(detail).toHaveTextContent("item #42");
            expect(detail).toHaveTextContent("Aguardando aprovação");
        });

        it("shows the diff by file with its additions and deletions", async () => {
            stubApprovalsApi();

            renderAppAt(approvalPagePath(PENDING_APPROVAL.nodeRunId));

            const diff = await screen.findByRole("region", { name: "Diff" });
            expect(diff).toHaveTextContent("1 file changed, 1 insertion(+), 1 deletion(-)");
            const cartFile = within(diff).getByRole("button", { name: /src\/cart\.ts/ });
            expect(cartFile).toHaveTextContent("+1");
            expect(cartFile).toHaveTextContent("-1");
            expect(within(diff).getByText("const fee = 2;")).toBeInTheDocument();
            expect(within(diff).getByRole("button", { name: /README\.md/ })).toHaveTextContent(
                "+1",
            );
        });

        it("collapses the diff of a file when its header is clicked", async () => {
            stubApprovalsApi();
            renderAppAt(approvalPagePath(PENDING_APPROVAL.nodeRunId));
            const diff = await screen.findByRole("region", { name: "Diff" });
            const cartFile = within(diff).getByRole("button", { name: /src\/cart\.ts/ });

            await userEvent.setup().click(cartFile);

            expect(cartFile).toHaveAttribute("aria-expanded", "false");
            expect(within(diff).queryByText("const fee = 2;")).not.toBeInTheDocument();
        });

        it("shows the artifacts of the same item in the run and links to its logs", async () => {
            stubApprovalsApi();

            renderAppAt(approvalPagePath(PENDING_APPROVAL.nodeRunId));

            const artifacts = await screen.findByRole("list", { name: "Artefatos" });
            expect(await within(artifacts).findByText(/Cobrar taxa de entrega/)).toBeVisible();
            expect(within(artifacts).getAllByRole("listitem")).toHaveLength(1);
            expect(screen.getByRole("link", { name: "Ver logs da run" })).toHaveAttribute(
                "href",
                `/projects/${PROJECT_ID}/runs/run_1?nodeRun=${PENDING_APPROVAL.nodeRunId}`,
            );
        });

        it("hides the sections the gate did not ask to show", async () => {
            stubApprovalsApi();

            renderAppAt(approvalPagePath(OLDER_PENDING_APPROVAL.nodeRunId));

            await findDetail();
            expect(screen.queryByRole("region", { name: "Diff" })).not.toBeInTheDocument();
            expect(screen.queryByRole("list", { name: "Artefatos" })).not.toBeInTheDocument();
            expect(screen.queryByRole("link", { name: "Ver logs da run" })).not.toBeInTheDocument();
        });

        it("shows the decision and the comment of a resolved approval, without actions", async () => {
            stubApprovalsApi();

            renderAppAt(approvalPagePath(REJECTED_APPROVAL.nodeRunId));

            const detail = await findDetail();
            expect(detail).toHaveTextContent("Rejeitado");
            expect(detail).toHaveTextContent("Faltam testes");
            expect(within(detail).queryByRole("button", { name: "Aprovar" })).toBeNull();
        });
    });

    describe("resolve", () => {
        it("approves without a comment", async () => {
            const fetchSpy = stubApprovalsApi({
                "POST /api/approvals/apv_pendente/resolve": () =>
                    Response.json({ ...PENDING_APPROVAL, status: "approved" }),
            });
            renderAppAt(approvalPagePath(PENDING_APPROVAL.nodeRunId));
            const detail = await findDetail();

            await userEvent.setup().click(within(detail).getByRole("button", { name: "Aprovar" }));

            await waitFor(() =>
                expect(listSentWrites(fetchSpy)).toEqual([
                    {
                        method: "POST",
                        url: "/api/approvals/apv_pendente/resolve",
                        body: { decision: "approved" },
                    },
                ]),
            );
        });

        it("asks for a comment before rejecting", async () => {
            const fetchSpy = stubApprovalsApi();
            renderAppAt(approvalPagePath(PENDING_APPROVAL.nodeRunId));
            const detail = await findDetail();

            await userEvent.setup().click(within(detail).getByRole("button", { name: "Rejeitar" }));

            expect(
                await within(detail).findByText("Escreva um comentário para rejeitar."),
            ).toBeInTheDocument();
            expect(listSentWrites(fetchSpy)).toEqual([]);
        });

        it("rejects with the comment", async () => {
            const fetchSpy = stubApprovalsApi({
                "POST /api/approvals/apv_pendente/resolve": () =>
                    Response.json({ ...PENDING_APPROVAL, status: "rejected" }),
            });
            renderAppAt(approvalPagePath(PENDING_APPROVAL.nodeRunId));
            const detail = await findDetail();
            const user = userEvent.setup();

            await user.type(within(detail).getByLabelText("Comentário"), "Faltam testes");
            await user.click(within(detail).getByRole("button", { name: "Rejeitar" }));

            await waitFor(() =>
                expect(listSentWrites(fetchSpy)).toEqual([
                    {
                        method: "POST",
                        url: "/api/approvals/apv_pendente/resolve",
                        body: { decision: "rejected", comment: "Faltam testes" },
                    },
                ]),
            );
        });
    });

    describe("topbar", () => {
        it("shows how many approvals of the project are pending", async () => {
            stubApprovalsApi();

            renderAppAt(`/projects/${PROJECT_ID}/runs`);

            expect(
                await screen.findByRole("link", { name: "2 aprovações pendentes" }),
            ).toHaveAttribute("href", APPROVALS_PAGE_PATH);
        });

        it("hides the counter when nothing is pending", async () => {
            stubApprovalsApi({ [`GET ${PENDING_APPROVALS_URL}`]: () => Response.json([]) });

            renderAppAt(APPROVALS_PAGE_PATH);

            await findDetail();
            expect(screen.queryByRole("link", { name: /pendente/ })).not.toBeInTheDocument();
        });
    });
});
