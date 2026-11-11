import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { MockInstance } from "vitest";

import { formatDateTime } from "@/lib/format.js";
import type { FlowSummary, FlowVersion } from "@/shared/flow_types.js";
import type {
    ListedTrigger,
    TriggerFire,
    TriggersPaused,
    TriggerWithToken,
} from "@/shared/trigger_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import { listSentWrites, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import type { FakeRoutes } from "@/test/fakes/fake_fetch.js";
import { renderAppAt } from "@/test/render_app_at.js";

const TRIGGERS_PAGE_PATH = "/projects/prj_forja/triggers";
const TRIGGERS_API = "/api/projects/prj_forja/triggers";
const HTTP_CREATED = 201;
const HTTP_NO_CONTENT = 204;
const BROWSER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const NEXT_FIRE_AT = "2026-11-12T01:00:00.000Z";
const FIRED_AT = "2026-11-11T12:00:00.000Z";

const DELIVERY_FLOW: FlowSummary = {
    id: "flw_entrega",
    projectId: "prj_forja",
    name: "Entrega",
    isDefault: true,
    archived: false,
    latestVersion: 2,
    draftUpdatedAt: "2026-11-01T10:00:00.000Z",
    draftRevision: 3,
};

const PUBLISHED_DELIVERY_FLOW: FlowVersion = {
    flowId: DELIVERY_FLOW.id,
    version: 2,
    graph: buildCanonicalFlow(),
    publishedAt: "2026-11-01T10:00:00.000Z",
};

const MANUAL_TRIGGER: ListedTrigger = {
    id: "trg_manual",
    projectId: "prj_forja",
    flowId: DELIVERY_FLOW.id,
    name: "Disparo manual",
    enabled: true,
    policy: "queue",
    itemSelection: "source",
    config: { kind: "manual" },
    createdAt: "2026-11-01T10:00:00.000Z",
};

const NIGHTLY_TRIGGER: ListedTrigger = {
    ...MANUAL_TRIGGER,
    id: "trg_noturno",
    name: "Noturno",
    policy: "skip",
    config: { kind: "schedule", cron: "0 22 * * *", timezone: BROWSER_TIMEZONE },
    cronDescription: "todo dia às 22:00",
    nextFireAt: NEXT_FIRE_AT,
};

const WEBHOOK_TRIGGER: TriggerWithToken = {
    ...MANUAL_TRIGGER,
    id: "trg_hook",
    name: "CI",
    policy: "skip",
    config: { kind: "webhook", tokenHash: "hash" },
    token: "segredo-do-webhook",
};

const STARTED_FIRE: TriggerFire = {
    id: "tf_1",
    triggerId: MANUAL_TRIGGER.id,
    at: FIRED_AT,
    outcome: "started",
    runId: "run_42",
};

function stubTriggersApi(routes: FakeRoutes = {}): MockInstance<typeof fetch> {
    return stubFetchRoutes({
        "GET /api/projects/prj_forja/flows": () => Response.json([DELIVERY_FLOW]),
        "GET /api/flows/flw_entrega/versions/2": () => Response.json(PUBLISHED_DELIVERY_FLOW),
        [`GET ${TRIGGERS_API}`]: () => Response.json([MANUAL_TRIGGER, NIGHTLY_TRIGGER]),
        "GET /api/triggers/trg_manual/history?limit=1": () => Response.json([]),
        "GET /api/triggers/trg_noturno/history?limit=1": () => Response.json([]),
        "GET /api/triggers/paused": () => Response.json({ paused: false }),
        ...routes,
    });
}

function respondCreated(body: unknown): () => Response {
    return () => Response.json(body, { status: HTTP_CREATED });
}

async function findTriggerRow(name: string): Promise<HTMLElement> {
    return screen.findByRole("row", { name: new RegExp(name) });
}

async function chooseOption(label: string, option: string): Promise<void> {
    const user = userEvent.setup();
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: label }));
    await user.click(screen.getByRole("option", { name: option }));
}

async function openNewTriggerForm(name: string): Promise<HTMLElement> {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Novo gatilho" }));
    const dialog = screen.getByRole("dialog", { name: "Novo gatilho" });
    await user.type(within(dialog).getByLabelText("Nome"), name);
    await waitFor(() =>
        expect(within(dialog).getByRole("combobox", { name: "Fluxo" })).toHaveTextContent(
            "Entrega",
        ),
    );

    return dialog;
}

describe("TriggersPage", () => {
    it("lists the triggers with flow, type, policy and next fire", async () => {
        stubTriggersApi();

        renderAppAt(TRIGGERS_PAGE_PATH);

        const nightlyRow = await findTriggerRow("Noturno");
        expect(await within(nightlyRow).findByText("Entrega")).toBeInTheDocument();
        expect(within(nightlyRow).getByText("Horário")).toBeInTheDocument();
        expect(within(nightlyRow).getByText("Pular")).toBeInTheDocument();
        expect(
            within(nightlyRow).getByText(
                `todo dia às 22:00 · ${formatDateTime(new Date(NEXT_FIRE_AT))}`,
            ),
        ).toBeInTheDocument();
        expect(within(nightlyRow).getByText("Nunca disparado")).toBeInTheDocument();
        const manualRow = await findTriggerRow("Disparo manual");
        expect(within(manualRow).getByText("Manual")).toBeInTheDocument();
        expect(within(manualRow).getByText("Enfileirar")).toBeInTheDocument();
    });

    it("offers to create the first trigger when there are none", async () => {
        stubTriggersApi({ [`GET ${TRIGGERS_API}`]: () => Response.json([]) });

        renderAppAt(TRIGGERS_PAGE_PATH);

        expect(
            await screen.findByRole("heading", { name: "Nenhum gatilho ainda" }),
        ).toBeInTheDocument();
    });

    it("creates a trigger every day at 22:00 and shows its next fire", async () => {
        const user = userEvent.setup();
        let isCreated = false;
        const fetchSpy = stubTriggersApi({
            [`GET ${TRIGGERS_API}`]: () => Response.json(isCreated ? [NIGHTLY_TRIGGER] : []),
            [`POST ${TRIGGERS_API}`]: () => {
                isCreated = true;
                return respondCreated(NIGHTLY_TRIGGER)();
            },
        });
        renderAppAt(TRIGGERS_PAGE_PATH);

        const dialog = await openNewTriggerForm("Noturno");
        await chooseOption("Tipo", "Horário");
        await chooseOption("Quando", "Todo dia às 22:00");
        expect(within(dialog).getByLabelText("Expressão cron")).toHaveValue("0 22 * * *");
        await chooseOption("Se já houver uma run", "Pular");
        await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(listSentWrites(fetchSpy)).toEqual([
            {
                method: "POST",
                url: TRIGGERS_API,
                body: {
                    flowId: DELIVERY_FLOW.id,
                    name: "Noturno",
                    policy: "skip",
                    itemSelection: "source",
                    config: { kind: "schedule", cron: "0 22 * * *", timezone: BROWSER_TIMEZONE },
                },
            },
        ]);
        const row = await findTriggerRow("Noturno");
        expect(
            within(row).getByText(`todo dia às 22:00 · ${formatDateTime(new Date(NEXT_FIRE_AT))}`),
        ).toBeInTheDocument();
    });

    it("accepts a custom cron expression", async () => {
        const user = userEvent.setup();
        const fetchSpy = stubTriggersApi({
            [`POST ${TRIGGERS_API}`]: respondCreated(NIGHTLY_TRIGGER),
        });
        renderAppAt(TRIGGERS_PAGE_PATH);

        const dialog = await openNewTriggerForm("Madrugada");
        await chooseOption("Tipo", "Horário");
        await chooseOption("Quando", "Personalizado");
        const cronField = within(dialog).getByLabelText("Expressão cron");
        await user.clear(cronField);
        await user.type(cronField, "15 3 * * 0");
        await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

        await waitFor(() => expect(listSentWrites(fetchSpy)).toHaveLength(1));
        expect(listSentWrites(fetchSpy)[0]?.body).toMatchObject({
            config: { kind: "schedule", cron: "15 3 * * 0", timezone: BROWSER_TIMEZONE },
        });
    });

    it("creates a trigger for finished runs of a flow with a given status", async () => {
        const user = userEvent.setup();
        const fetchSpy = stubTriggersApi({
            [`POST ${TRIGGERS_API}`]: respondCreated(MANUAL_TRIGGER),
        });
        renderAppAt(TRIGGERS_PAGE_PATH);

        const dialog = await openNewTriggerForm("Depois da entrega");
        await chooseOption("Tipo", "Evento");
        await chooseOption("Evento", "Quando uma run terminar");
        await chooseOption("Fluxo da run", "Entrega");
        await chooseOption("Estado da run", "Falha");
        await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

        await waitFor(() => expect(listSentWrites(fetchSpy)).toHaveLength(1));
        expect(listSentWrites(fetchSpy)[0]?.body).toMatchObject({
            config: {
                kind: "event",
                event: "run.finished",
                filter: { flowId: DELIVERY_FLOW.id, status: "FAILED" },
            },
        });
    });

    it("creates a trigger for the usage limit reset with no run filter", async () => {
        const user = userEvent.setup();
        const fetchSpy = stubTriggersApi({
            [`POST ${TRIGGERS_API}`]: respondCreated(MANUAL_TRIGGER),
        });
        renderAppAt(TRIGGERS_PAGE_PATH);

        const dialog = await openNewTriggerForm("Retomar");
        await chooseOption("Tipo", "Evento");
        await chooseOption("Evento", "Quando o limite de uso resetar");
        expect(within(dialog).queryByRole("combobox", { name: "Estado da run" })).toBeNull();
        await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

        await waitFor(() => expect(listSentWrites(fetchSpy)).toHaveLength(1));
        expect(listSentWrites(fetchSpy)[0]?.body).toMatchObject({
            config: { kind: "event", event: "usage.limit_reset" },
        });
    });

    it("offers the board columns of the chosen flow for a board column trigger", async () => {
        const user = userEvent.setup();
        const fetchSpy = stubTriggersApi({
            [`POST ${TRIGGERS_API}`]: respondCreated(MANUAL_TRIGGER),
        });
        renderAppAt(TRIGGERS_PAGE_PATH);

        const dialog = await openNewTriggerForm("Ao soltar em Desenvolver");
        await chooseOption("Tipo", "Coluna do board");
        await chooseOption("Coluna", "Desenvolver");
        await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

        await waitFor(() => expect(listSentWrites(fetchSpy)).toHaveLength(1));
        expect(listSentWrites(fetchSpy)[0]?.body).toMatchObject({
            config: { kind: "board_column", columnId: "stage:develop" },
        });
    });

    it("shows the webhook token only once, with a curl example", async () => {
        const user = userEvent.setup();
        stubTriggersApi({ [`POST ${TRIGGERS_API}`]: respondCreated(WEBHOOK_TRIGGER) });
        renderAppAt(TRIGGERS_PAGE_PATH);

        const form = await openNewTriggerForm("CI");
        await chooseOption("Tipo", "Webhook");
        await user.click(within(form).getByRole("button", { name: "Salvar" }));

        const tokenDialog = await screen.findByRole("dialog", { name: "Token do webhook" });
        expect(tokenDialog).toHaveTextContent("não será mostrado de novo");
        expect(tokenDialog).toHaveTextContent(
            `curl -X POST ${window.location.origin}/api/hooks/trg_hook -H "X-Forja-Token: segredo-do-webhook"`,
        );
        await user.click(within(tokenDialog).getByRole("button", { name: "Copiei o token" }));
        expect(screen.queryByText(/segredo-do-webhook/)).toBeNull();
    });

    it("disables a trigger with its switch", async () => {
        const user = userEvent.setup();
        const fetchSpy = stubTriggersApi({
            "PATCH /api/triggers/trg_noturno": () => Response.json(NIGHTLY_TRIGGER),
        });
        renderAppAt(TRIGGERS_PAGE_PATH);

        const row = await findTriggerRow("Noturno");
        await user.click(within(row).getByRole("switch", { name: "Habilitado" }));

        await waitFor(() =>
            expect(listSentWrites(fetchSpy)).toEqual([
                {
                    method: "PATCH",
                    url: "/api/triggers/trg_noturno",
                    body: { enabled: false },
                },
            ]),
        );
    });

    it("edits the name, schedule and policy of a trigger", async () => {
        const user = userEvent.setup();
        const fetchSpy = stubTriggersApi({
            "PATCH /api/triggers/trg_noturno": () => Response.json(NIGHTLY_TRIGGER),
        });
        renderAppAt(TRIGGERS_PAGE_PATH);

        const row = await findTriggerRow("Noturno");
        await user.click(within(row).getByRole("button", { name: "Editar Noturno" }));
        const dialog = screen.getByRole("dialog", { name: "Editar gatilho" });
        const nameField = within(dialog).getByLabelText("Nome");
        await user.clear(nameField);
        await user.type(nameField, "Dias úteis");
        await chooseOption("Quando", "Dias úteis às 08:00");
        await chooseOption("Se já houver uma run", "Rodar em paralelo");
        await user.click(within(dialog).getByRole("button", { name: "Salvar" }));

        await waitFor(() =>
            expect(listSentWrites(fetchSpy)).toEqual([
                {
                    method: "PATCH",
                    url: "/api/triggers/trg_noturno",
                    body: {
                        name: "Dias úteis",
                        policy: "parallel",
                        itemSelection: "source",
                        config: {
                            kind: "schedule",
                            cron: "0 8 * * 1-5",
                            timezone: BROWSER_TIMEZONE,
                        },
                    },
                },
            ]),
        );
    });

    it("removes a trigger only after confirming", async () => {
        const user = userEvent.setup();
        const fetchSpy = stubTriggersApi({
            "DELETE /api/triggers/trg_noturno": () =>
                new Response(null, { status: HTTP_NO_CONTENT }),
        });
        renderAppAt(TRIGGERS_PAGE_PATH);

        const row = await findTriggerRow("Noturno");
        await user.click(within(row).getByRole("button", { name: "Remover Noturno" }));
        const confirmation = screen.getByRole("dialog", { name: "Remover gatilho" });

        expect(confirmation).toHaveTextContent("Noturno");
        expect(listSentWrites(fetchSpy)).toEqual([]);
        await user.click(within(confirmation).getByRole("button", { name: "Remover" }));
        await waitFor(() =>
            expect(listSentWrites(fetchSpy)).toEqual([
                { method: "DELETE", url: "/api/triggers/trg_noturno", body: undefined },
            ]),
        );
    });

    it("fires a trigger now and shows the started run in its history", async () => {
        const user = userEvent.setup();
        let fires: TriggerFire[] = [];
        const fetchSpy = stubTriggersApi({
            "POST /api/triggers/trg_manual/fire": () => {
                fires = [STARTED_FIRE];
                return respondCreated(STARTED_FIRE)();
            },
            "GET /api/triggers/trg_manual/history?limit=1": () => Response.json(fires),
            "GET /api/triggers/trg_manual/history?limit=50": () => Response.json(fires),
        });
        renderAppAt(TRIGGERS_PAGE_PATH);

        const row = await findTriggerRow("Disparo manual");
        await user.click(
            within(row).getByRole("button", { name: "Disparar Disparo manual agora" }),
        );

        expect(
            await within(row).findByText(`${formatDateTime(new Date(FIRED_AT))} · Run iniciada`),
        ).toBeInTheDocument();
        expect(listSentWrites(fetchSpy)).toEqual([
            { method: "POST", url: "/api/triggers/trg_manual/fire", body: {} },
        ]);
        await user.click(within(row).getByRole("button", { name: "Histórico de Disparo manual" }));
        const history = screen.getByRole("dialog", { name: "Histórico de Disparo manual" });
        expect(await within(history).findByText("Run iniciada")).toBeInTheDocument();
        expect(within(history).getByRole("link", { name: "Abrir run" })).toHaveAttribute(
            "href",
            "/projects/prj_forja/runs/run_42",
        );
    });

    it("pauses every trigger and shows an indicator in the topbar that resumes them", async () => {
        const user = userEvent.setup();
        let pausedState: TriggersPaused = { paused: false };
        const fetchSpy = stubTriggersApi({
            "GET /api/triggers/paused": () => Response.json(pausedState),
            "PUT /api/triggers/paused": () => {
                pausedState = { paused: !pausedState.paused };
                return Response.json(pausedState);
            },
        });
        renderAppAt(TRIGGERS_PAGE_PATH);

        await user.click(await screen.findByRole("button", { name: "Pausar todos" }));

        const banner = await screen.findByRole("status", { name: "Gatilhos pausados" });
        expect(listSentWrites(fetchSpy)).toEqual([
            { method: "PUT", url: "/api/triggers/paused", body: { paused: true } },
        ]);
        expect(screen.getByRole("button", { name: "Retomar todos" })).toBeInTheDocument();
        await user.click(within(banner).getByRole("button", { name: "Retomar" }));
        await waitFor(() =>
            expect(screen.queryByRole("status", { name: "Gatilhos pausados" })).toBeNull(),
        );
        expect(listSentWrites(fetchSpy)[1]).toEqual({
            method: "PUT",
            url: "/api/triggers/paused",
            body: { paused: false },
        });
    });

    it("shows an automatic fire skipped while paused as skipped", async () => {
        stubTriggersApi({
            "GET /api/triggers/trg_noturno/history?limit=1": () =>
                Response.json([
                    {
                        id: "tf_2",
                        triggerId: NIGHTLY_TRIGGER.id,
                        at: FIRED_AT,
                        outcome: "skipped",
                    },
                ]),
        });

        renderAppAt(TRIGGERS_PAGE_PATH);

        const row = await findTriggerRow("Noturno");
        expect(
            await within(row).findByText(`${formatDateTime(new Date(FIRED_AT))} · Pulado`),
        ).toBeInTheDocument();
    });
});
