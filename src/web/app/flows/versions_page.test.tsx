import { screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";

import type { FlowGraph } from "@/shared/flow_graph.js";
import type { FlowDraft, FlowVersion, FlowVersionSummary } from "@/shared/flow_types.js";
import { buildCanonicalFlow } from "@/test/factories/flow_graph_factory.js";
import {
    removeNodes,
    updateAgentConfig,
    updateNode,
} from "@/test/factories/flow_graph_variations.js";
import { listSentWrites, stubFetchRoutes } from "@/test/fakes/fake_fetch.js";
import type { FakeRoutes } from "@/test/fakes/fake_fetch.js";
import { renderAppAt } from "@/test/render_app_at.js";

const PROJECT_ID = "prj_forja";
const FLOW_ID = "flw_canonico";
const VERSIONS_PATH = `/projects/${PROJECT_ID}/flows/${FLOW_ID}/versions`;
const FLOW_API_PATH = `/api/flows/${FLOW_ID}`;

function buildVersion(version: number, graph: FlowGraph, note?: string): FlowVersion {
    return {
        flowId: FLOW_ID,
        version,
        graph,
        publishedAt: `2026-11-0${version}T12:00:00Z`,
        note,
    };
}

function fakeVersionsApi({
    versions,
    draftGraph = buildCanonicalFlow(),
}: {
    versions: FlowVersion[];
    draftGraph?: FlowGraph;
}): FakeRoutes {
    let draft: FlowDraft = {
        flowId: FLOW_ID,
        graph: draftGraph,
        revision: 4,
        updatedAt: "2026-11-10T12:00:00Z",
    };
    const routes: FakeRoutes = {
        [`GET ${FLOW_API_PATH}/versions`]: () => Response.json(versions.map(toVersionSummary)),
        [`GET ${FLOW_API_PATH}/draft`]: () => Response.json(draft),
    };
    for (const version of versions) {
        routes[`GET ${FLOW_API_PATH}/versions/${version.version}`] = () => Response.json(version);
        routes[`POST ${FLOW_API_PATH}/versions/${version.version}/restore`] = () => {
            draft = { ...draft, graph: version.graph, revision: draft.revision + 1 };
            return Response.json(draft);
        };
    }

    return routes;
}

function toVersionSummary({ flowId, version, publishedAt, note }: FlowVersion): FlowVersionSummary {
    return { flowId, version, publishedAt, note };
}

describe("VersionsPage", () => {
    it("lists the published versions newest first, with number, date and note", async () => {
        stubFetchRoutes(
            fakeVersionsApi({
                versions: [
                    buildVersion(1, buildCanonicalFlow()),
                    buildVersion(2, buildCanonicalFlow(), "Reviewer mais rigoroso"),
                ],
            }),
        );

        renderAppAt(VERSIONS_PATH);

        const versionList = await screen.findByRole("list", { name: "Versões publicadas" });
        const [newestVersion, oldestVersion] = within(versionList).getAllByRole("listitem");
        expect(newestVersion).toHaveTextContent("v2");
        expect(newestVersion).toHaveTextContent("Reviewer mais rigoroso");
        expect(newestVersion).toHaveTextContent("02/11/2026");
        expect(oldestVersion).toHaveTextContent("v1");
        expect(oldestVersion).toHaveTextContent("Sem nota");
    });

    it("tells when the flow has no published version", async () => {
        stubFetchRoutes(fakeVersionsApi({ versions: [] }));

        renderAppAt(VERSIONS_PATH);

        expect(await screen.findByText("Nenhuma versão publicada")).toBeInTheDocument();
    });

    describe("comparing", () => {
        it("compares the latest version with the one before it by default", async () => {
            const before = updateAgentConfig(buildCanonicalFlow(), "reviewer", {
                effort: "medium",
            });
            stubFetchRoutes(
                fakeVersionsApi({
                    versions: [buildVersion(1, before), buildVersion(2, buildCanonicalFlow())],
                }),
            );

            renderAppAt(VERSIONS_PATH);

            const reviewerChanges = await screen.findByRole("article", { name: "Reviewer" });
            expect(reviewerChanges).toHaveTextContent("config.effort: medium → high");
        });

        it("shows a changed prompt line by line", async () => {
            const withPrompt = (prompt: string): FlowGraph =>
                updateAgentConfig(buildCanonicalFlow(), "reviewer", { prompt });
            stubFetchRoutes(
                fakeVersionsApi({
                    versions: [
                        buildVersion(1, withPrompt("Revise o branch.\nSeja breve.\nAbra o PR.")),
                        buildVersion(2, withPrompt("Revise o branch.\nSeja rigoroso.\nAbra o PR.")),
                    ],
                }),
            );

            renderAppAt(VERSIONS_PATH);

            const reviewerChanges = await screen.findByRole("article", { name: "Reviewer" });
            expect(within(reviewerChanges).getByRole("deletion")).toHaveTextContent("Seja breve.");
            expect(within(reviewerChanges).getByRole("insertion")).toHaveTextContent(
                "Seja rigoroso.",
            );
            expect(within(reviewerChanges).getAllByText(/Revise o branch\./)).toHaveLength(1);
        });

        it("compares the selected version with the draft when asked", async () => {
            const user = userEvent.setup();
            stubFetchRoutes(
                fakeVersionsApi({
                    versions: [
                        buildVersion(1, buildCanonicalFlow()),
                        buildVersion(2, buildCanonicalFlow()),
                    ],
                    draftGraph: updateAgentConfig(buildCanonicalFlow(), "reviewer", {
                        effort: "medium",
                    }),
                }),
            );
            renderAppAt(VERSIONS_PATH);

            await chooseComparisonWithDraft(user);

            const reviewerChanges = await screen.findByRole("article", { name: "Reviewer" });
            expect(reviewerChanges).toHaveTextContent("config.effort: high → medium");
        });

        it("compares the first version with the draft, as nothing precedes it", async () => {
            const user = userEvent.setup();
            stubFetchRoutes(
                fakeVersionsApi({
                    versions: [
                        buildVersion(1, buildCanonicalFlow()),
                        buildVersion(2, buildCanonicalFlow()),
                    ],
                    draftGraph: removeNodes(buildCanonicalFlow(), ["tl"]),
                }),
            );
            renderAppAt(VERSIONS_PATH);

            await user.click(await screen.findByRole("button", { name: /v1/ }));

            expect(screen.getByRole("combobox", { name: "Comparar com" })).toHaveTextContent(
                "Rascunho",
            );
            const nodeChanges = await screen.findByRole("region", { name: "Nós" });
            expect(nodeChanges).toHaveTextContent("TL (removido)");
        });

        it("shows no differences when the nodes only moved", async () => {
            const moved = updateNode(buildCanonicalFlow(), "dev", (node) => ({
                ...node,
                position: { x: node.position.x + 120, y: node.position.y + 80 },
            }));
            stubFetchRoutes(
                fakeVersionsApi({
                    versions: [buildVersion(1, buildCanonicalFlow()), buildVersion(2, moved)],
                }),
            );

            renderAppAt(VERSIONS_PATH);

            expect(await screen.findByText("Nenhuma diferença entre v1 e v2.")).toBeInTheDocument();
        });
    });

    describe("restoring", () => {
        it("makes the draft equal to the version after the user confirms", async () => {
            const user = userEvent.setup();
            const secondGraph = updateAgentConfig(buildCanonicalFlow(), "reviewer", {
                effort: "medium",
            });
            const fetchSpy = stubFetchRoutes(
                fakeVersionsApi({
                    versions: [buildVersion(1, buildCanonicalFlow()), buildVersion(2, secondGraph)],
                }),
            );
            renderAppAt(VERSIONS_PATH);
            await chooseComparisonWithDraft(user);

            await user.click(await screen.findByRole("button", { name: "Restaurar no rascunho" }));
            const confirmation = screen.getByRole("dialog", { name: "Restaurar v2" });
            expect(confirmation).toHaveTextContent("substitui o rascunho atual");
            await user.click(within(confirmation).getByRole("button", { name: "Restaurar" }));

            expect(
                await screen.findByText("Nenhuma diferença entre v2 e Rascunho."),
            ).toBeInTheDocument();
            expect(listSentWrites(fetchSpy)).toEqual([
                { method: "POST", url: `${FLOW_API_PATH}/versions/2/restore`, body: undefined },
            ]);
        });

        it("leaves the draft alone when the user cancels", async () => {
            const user = userEvent.setup();
            const fetchSpy = stubFetchRoutes(
                fakeVersionsApi({ versions: [buildVersion(1, buildCanonicalFlow())] }),
            );
            renderAppAt(VERSIONS_PATH);

            await user.click(await screen.findByRole("button", { name: "Restaurar no rascunho" }));
            await user.click(screen.getByRole("button", { name: "Cancelar" }));

            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
            expect(listSentWrites(fetchSpy)).toEqual([]);
        });
    });
});

async function chooseComparisonWithDraft(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(await screen.findByRole("combobox", { name: "Comparar com" }));
    await user.click(screen.getByRole("option", { name: "Rascunho" }));
}
