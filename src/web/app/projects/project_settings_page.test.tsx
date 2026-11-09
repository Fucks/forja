import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { TOOL_PROFILE_PRESETS } from "@/server/tool_profiles/tool_profile_presets.js";
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_PROJECT_SETTINGS } from "@/shared/settings_types.js";
import type { GlobalSettings, ProjectSettings } from "@/shared/settings_types.js";
import type { AgentImageStatus } from "@/shared/agent_image_types.js";
import { stubElementSizes } from "@/test/fakes/fake_element_size.js";
import { listSentWrites, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import type { FakeRoutes } from "@/test/fakes/fake_fetch.js";
import { renderAppAt } from "@/test/render_app_at.js";

const SETTINGS_PAGE_PATH = "/projects/prj_forja/settings";
const PROJECT_SETTINGS_URL = "/api/projects/prj_forja/settings";
const GLOBAL_SETTINGS_URL = "/api/settings";
const AGENT_IMAGE_URL = "/api/projects/prj_forja/agent-image";
const BUILD_URL = `${AGENT_IMAGE_URL}/build`;
const LOG_VIEWPORT_HEIGHT_PX = 320;
const LOG_ROW_HEIGHT_PX = 20;
const MISSING_IMAGE: AgentImageStatus = {
    image: "forja-agent:latest",
    exists: false,
    source: "forja_default",
};
const BUILT_IMAGE: AgentImageStatus = {
    ...MISSING_IMAGE,
    exists: true,
    createdAt: "2026-11-09T12:00:00Z",
    sizeMb: 2048,
};

const SAVED_PROJECT_CHANGES: Partial<ProjectSettings> = { defaultEffort: "max" };
const SAVED_GLOBAL_CHANGES: Partial<GlobalSettings> = { logRetentionDays: 7 };

// The fake routes can't read the request body, so each PUT applies the change the tests make,
// and the reload after saving answers it.
function fakeSettingsApi(): FakeRoutes {
    let projectSettings: ProjectSettings = DEFAULT_PROJECT_SETTINGS;
    let globalSettings: GlobalSettings = DEFAULT_GLOBAL_SETTINGS;

    return {
        [`GET ${PROJECT_SETTINGS_URL}`]: () => Response.json(projectSettings),
        [`GET ${GLOBAL_SETTINGS_URL}`]: () => Response.json(globalSettings),
        [`GET ${AGENT_IMAGE_URL}`]: () => Response.json(MISSING_IMAGE),
        "GET /api/credentials": () => Response.json([]),
        "GET /api/tool-profiles": () => Response.json(TOOL_PROFILE_PRESETS),
        [`PUT ${PROJECT_SETTINGS_URL}`]: () => {
            projectSettings = { ...projectSettings, ...SAVED_PROJECT_CHANGES };
            return Response.json(projectSettings);
        },
        [`PUT ${GLOBAL_SETTINGS_URL}`]: () => {
            globalSettings = { ...globalSettings, ...SAVED_GLOBAL_CHANGES };
            return Response.json(globalSettings);
        },
    };
}

describe("ProjectSettingsPage", () => {
    it("shows the inherited values as placeholders", async () => {
        stubFetchRoutes(fakeSettingsApi());

        renderAppAt(SETTINGS_PAGE_PATH);

        const image = await screen.findByLabelText("Imagem Docker");
        expect(image).toHaveValue("");
        expect(image).toHaveAttribute("placeholder", "padrão: forja-agent:latest");
        expect(screen.getByRole("radio", { name: "high" })).toBeChecked();
        expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
    });

    it("saves the project settings after editing the effort", async () => {
        const user = userEvent.setup();
        const fetchSpy = stubFetchRoutes(fakeSettingsApi());
        renderAppAt(SETTINGS_PAGE_PATH);

        await user.click(await screen.findByRole("radio", { name: "max" }));
        await user.click(screen.getByRole("button", { name: "Salvar" }));

        await waitFor(() =>
            expect(listSentWrites(fetchSpy)).toEqual([
                {
                    method: "PUT",
                    url: PROJECT_SETTINGS_URL,
                    body: { ...DEFAULT_PROJECT_SETTINGS, defaultEffort: "max" },
                },
            ]),
        );
        await waitFor(() =>
            expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument(),
        );
        expect(screen.getByRole("radio", { name: "max" })).toBeChecked();
    });

    it("saves both levels and reloads them", async () => {
        const user = userEvent.setup();
        const fetchSpy = stubFetchRoutes(fakeSettingsApi());
        renderAppAt(SETTINGS_PAGE_PATH);

        await user.click(await screen.findByRole("radio", { name: "max" }));
        const wholeForja = screen.getByRole("region", { name: "Toda a Forja" });
        await user.type(within(wholeForja).getByLabelText("Retenção de logs (dias)"), "7");
        await user.click(screen.getByRole("button", { name: "Salvar" }));

        await waitFor(() =>
            expect(listSentWrites(fetchSpy)).toContainEqual({
                method: "PUT",
                url: GLOBAL_SETTINGS_URL,
                body: { ...DEFAULT_GLOBAL_SETTINGS, logRetentionDays: 7 },
            }),
        );
        expect(listSentWrites(fetchSpy)).toHaveLength(2);
        await waitFor(() =>
            expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument(),
        );
        expect(within(wholeForja).getByLabelText("Retenção de logs (dias)")).toHaveValue(7);
        expect(screen.getByRole("radio", { name: "max" })).toBeChecked();
    });

    it("discards the changes", async () => {
        const user = userEvent.setup();
        stubFetchRoutes(fakeSettingsApi());
        renderAppAt(SETTINGS_PAGE_PATH);

        await user.click(await screen.findByRole("radio", { name: "low" }));
        await user.click(screen.getByRole("button", { name: "Descartar" }));

        expect(screen.getByRole("radio", { name: "high" })).toBeChecked();
        expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
    });
});

function encodeBuildEvent(event: string, payload: unknown): Uint8Array {
    return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function respondWithEventStream(start: (controller: ReadableStreamDefaultController) => void) {
    return new Response(new ReadableStream({ start }), {
        headers: { "content-type": "text/event-stream" },
    });
}

describe("ProjectSettingsPage agent image panel", () => {
    beforeEach(() => {
        stubElementSizes({
            viewportHeightPx: LOG_VIEWPORT_HEIGHT_PX,
            rowHeightPx: LOG_ROW_HEIGHT_PX,
        });
    });

    it("shows that the agent image is missing and where it would be built from", async () => {
        stubFetchRoutes(fakeSettingsApi());

        renderAppAt(SETTINGS_PAGE_PATH);

        const container = await screen.findByRole("region", { name: "Container" });
        expect(await within(container).findByText("forja-agent:latest")).toBeInTheDocument();
        expect(within(container).getByText("Falha")).toBeInTheDocument();
        expect(
            within(container).getByText(/Fonte: Dockerfile padrão da Forja/),
        ).toBeInTheDocument();
    });

    it("streams the build log and shows the image as ready when the build ends", async () => {
        const user = userEvent.setup();
        let imageStatus = MISSING_IMAGE;
        stubFetchRoutes({
            ...fakeSettingsApi(),
            [`GET ${AGENT_IMAGE_URL}`]: () => Response.json(imageStatus),
            [`POST ${BUILD_URL}`]: () =>
                respondWithEventStream((controller) => {
                    controller.enqueue(
                        encodeBuildEvent("line", { line: "#1 load build definition" }),
                    );
                    imageStatus = BUILT_IMAGE;
                    controller.enqueue(encodeBuildEvent("done", { ok: true, exitCode: 0 }));
                    controller.close();
                }),
        });
        renderAppAt(SETTINGS_PAGE_PATH);

        await user.click(await screen.findByRole("button", { name: "Construir imagem" }));

        expect(await screen.findByText("#1 load build definition")).toBeInTheDocument();
        expect(await screen.findByText("Imagem construída.")).toBeInTheDocument();
        expect(await screen.findByText("Sucesso")).toBeInTheDocument();
        expect(screen.getByText(/2048 MB/)).toBeInTheDocument();
    });

    it("turns the button into Cancelar during the build and aborts the request on click", async () => {
        const user = userEvent.setup();
        let buildSignal: AbortSignal | null | undefined;
        stubFetchRoutes({
            ...fakeSettingsApi(),
            [`POST ${BUILD_URL}`]: (init) =>
                respondWithEventStream((controller) => {
                    buildSignal = init?.signal;
                    controller.enqueue(
                        encodeBuildEvent("line", { line: "#1 load build definition" }),
                    );
                    buildSignal?.addEventListener("abort", () =>
                        controller.error(new DOMException("Aborted", "AbortError")),
                    );
                }),
        });
        renderAppAt(SETTINGS_PAGE_PATH);
        await user.click(await screen.findByRole("button", { name: "Construir imagem" }));

        await user.click(await screen.findByRole("button", { name: "Cancelar" }));

        expect(buildSignal?.aborted).toBe(true);
        expect(await screen.findByText("Build cancelado.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Construir imagem" })).toBeInTheDocument();
    });
});
