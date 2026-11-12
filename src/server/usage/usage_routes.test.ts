import type { FastifyInstance } from "fastify";

import { buildApp } from "@/server/app.js";
import type { DatabaseHandle } from "@/server/db/client.js";
import { ProjectRepository } from "@/server/projects/project_repository.js";
import { SqliteRunRepository } from "@/server/runs/sqlite_run_repository.js";
import { createSettingsLookups } from "@/server/settings/settings_lookups.js";
import { SettingsRepository } from "@/server/settings/settings_repository.js";
import { createSettingsService } from "@/server/settings/settings_service.js";
import { createAppUsageService } from "@/server/usage/app_usage_service.js";
import type { UsageService } from "@/server/usage/usage_service.js";
import type { UsageAggregate, UsageRecord } from "@/shared/usage_types.js";
import { buildProject } from "@/test/factories/project_factory.js";
import { buildRunRecord } from "@/test/factories/run_record_factory.js";
import { buildNewUsageRecord } from "@/test/factories/usage_record_factory.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { createTestAppDeps } from "@/test/test_app_deps.js";
import { createTestDb } from "@/test/test_db.js";

const PROJECT_ID = "prj_forja";
const RUN_ID = "run_entrega";
const RECORDED_AT = new Date("2026-11-09T12:00:00Z");
const PROJECT_USAGE_URL = `/api/projects/${PROJECT_ID}/usage`;
const RUN_USAGE_URL = `/api/runs/${RUN_ID}/usage`;
const NOVEMBER = "from=2026-11-01T00:00:00Z&to=2026-12-01T00:00:00Z";
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

describe("usage routes", () => {
    let database: DatabaseHandle;
    let usage: UsageService;
    let app: FastifyInstance;

    beforeEach(async () => {
        database = createTestDb();
        new ProjectRepository(database.db).insert(buildProject({ id: PROJECT_ID }));
        await new SqliteRunRepository(database.db, new FakeClock()).createRun(
            buildRunRecord({ id: RUN_ID, projectId: PROJECT_ID }),
        );
        usage = createUsageServiceOver(database);
        app = await buildApp(createTestAppDeps(database.db));
    });

    afterEach(async () => {
        await app.close();
        database.close();
    });

    function createUsageServiceOver({ db }: DatabaseHandle): UsageService {
        const clock = new FakeClock(RECORDED_AT);
        const settings = createSettingsService({
            repo: new SettingsRepository(db),
            lookups: createSettingsLookups(db),
            clock,
        });

        return createAppUsageService({ db, settings, clock });
    }

    function get(url: string) {
        return app.inject({ method: "GET", url });
    }

    describe("GET /api/projects/:projectId/usage", () => {
        it("answers the usage of the period grouped as asked", async () => {
            await usage.record(buildNewUsageRecord({ nodeId: "dev", nodeRunId: "nrn_1" }));
            await usage.record(buildNewUsageRecord({ nodeId: "reviewer", nodeRunId: "nrn_2" }));

            const response = await get(`${PROJECT_USAGE_URL}?${NOVEMBER}&groupBy=node`);

            expect(response.statusCode).toBe(HTTP_OK);
            const groups = response.json<UsageAggregate[]>();
            expect(groups.map(({ key, nodeRuns }) => ({ key, nodeRuns }))).toEqual([
                { key: "dev", nodeRuns: 1 },
                { key: "reviewer", nodeRuns: 1 },
            ]);
        });

        it("answers only the usage of the flow when flowId is given", async () => {
            await usage.record(buildNewUsageRecord({ flowId: "flw_entrega", nodeId: "dev" }));
            await usage.record(buildNewUsageRecord({ flowId: "flw_triagem", nodeId: "tl" }));

            const response = await get(
                `${PROJECT_USAGE_URL}?${NOVEMBER}&groupBy=node&flowId=flw_entrega`,
            );

            expect(response.json<UsageAggregate[]>().map(({ key }) => key)).toEqual(["dev"]);
        });

        it("answers only the usage of the node when nodeId is given", async () => {
            await usage.record(buildNewUsageRecord({ nodeId: "dev", nodeRunId: "nrn_1" }));
            await usage.record(buildNewUsageRecord({ nodeId: "tl", nodeRunId: "nrn_2" }));

            const response = await get(`${PROJECT_USAGE_URL}?${NOVEMBER}&groupBy=node&nodeId=tl`);

            expect(response.json<UsageAggregate[]>().map(({ key }) => key)).toEqual(["tl"]);
        });

        it.each([
            ["the period is missing", "groupBy=day"],
            ["a date is not a date", "from=ontem&to=2026-12-01T00:00:00Z&groupBy=day"],
            ["the grouping is unknown", `${NOVEMBER}&groupBy=semana`],
            ["the grouping is missing", NOVEMBER],
            ["the period ends before it starts", "from=2026-12-01&to=2026-11-01&groupBy=day"],
        ])("answers 400 when %s", async (_reason, query) => {
            const response = await get(`${PROJECT_USAGE_URL}?${query}`);

            expect(response.statusCode).toBe(HTTP_BAD_REQUEST);
        });

        it("answers 404 for a project that does not exist", async () => {
            const response = await get(
                `/api/projects/prj_inexistente/usage?${NOVEMBER}&groupBy=day`,
            );

            expect(response.statusCode).toBe(HTTP_NOT_FOUND);
        });
    });

    describe("GET /api/runs/:runId/usage", () => {
        it("answers the usage records of the run", async () => {
            const recorded = await usage.record(buildNewUsageRecord({ runId: RUN_ID }));
            await usage.record(buildNewUsageRecord({ runId: "run_outra" }));

            const response = await get(RUN_USAGE_URL);

            expect(response.statusCode).toBe(HTTP_OK);
            expect(response.json<UsageRecord[]>()).toEqual([recorded]);
        });

        it("answers 404 for a run that does not exist", async () => {
            const response = await get("/api/runs/run_inexistente/usage");

            expect(response.statusCode).toBe(HTTP_NOT_FOUND);
        });
    });
});
