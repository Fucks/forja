import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import { TOOL_PROFILE_PRESETS } from "@/server/tool_profiles/tool_profile_presets.js";
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_PROJECT_SETTINGS } from "@/shared/settings_types.js";
import type { GlobalSettings, ProjectSettings } from "@/shared/settings_types.js";
import { listSentWrites, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import type { FakeRoutes } from "@/test/fakes/fake_fetch.js";
import { renderAppAt } from "@/test/render_app_at.js";

const SETTINGS_PAGE_PATH = "/projects/prj_forja/settings";
const PROJECT_SETTINGS_URL = "/api/projects/prj_forja/settings";
const GLOBAL_SETTINGS_URL = "/api/settings";

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
