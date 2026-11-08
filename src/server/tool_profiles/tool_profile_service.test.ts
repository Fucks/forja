import type { DatabaseHandle } from "@/server/db/client.js";
import { ConflictError, DomainValidationError, NotFoundError } from "@/server/errors.js";
import {
    CODEGRAPH_PRESET_ID,
    DEFAULT_PRESET_ID,
    READONLY_PRESET_ID,
} from "@/server/tool_profiles/tool_profile_presets.js";
import { ToolProfileRepository } from "@/server/tool_profiles/tool_profile_repository.js";
import { createToolProfileService } from "@/server/tool_profiles/tool_profile_service.js";
import type { ToolProfileService } from "@/server/tool_profiles/tool_profile_service.js";
import { toolProfileInput } from "@/shared/tool_profile_types.js";
import type { ToolProfileInput } from "@/shared/tool_profile_types.js";
import { FakeClock } from "@/test/fakes/fake_clock.js";
import { createTestDb } from "@/test/test_db.js";

const CREATED_AT = new Date("2026-06-01T10:00:00Z");
const ONE_HOUR_MS = 3_600_000;
const PRESET_IDS = [CODEGRAPH_PRESET_ID, READONLY_PRESET_ID, DEFAULT_PRESET_ID];

function buildInput(overrides: Partial<ToolProfileInput> = {}): ToolProfileInput {
    return { ...toolProfileInput.parse({ name: "Revisor" }), ...overrides };
}

describe("ToolProfileService", () => {
    let database: DatabaseHandle;
    let clock: FakeClock;
    let service: ToolProfileService;

    beforeEach(() => {
        database = createTestDb();
        clock = new FakeClock(CREATED_AT);
        service = createToolProfileService({
            repo: new ToolProfileRepository(database.db),
            clock,
        });
    });

    afterEach(() => {
        database.close();
    });

    describe("presets", () => {
        it("lists the three builtin presets before any profile is created", async () => {
            const profiles = await service.list();

            expect(profiles.map((profile) => profile.id)).toEqual(PRESET_IDS);
            expect(profiles.every((profile) => profile.builtin)).toBe(true);
        });

        it("offers a CodeGraph preset that serves the MCP and indexes on start", async () => {
            const codegraph = await service.get(CODEGRAPH_PRESET_ID);

            expect(codegraph.mcpServers).toEqual([
                { name: "codegraph", command: "codegraph", args: ["serve", "--mcp"], env: {} },
            ]);
            expect(codegraph.allowedTools).toContain("mcp__codegraph__*");
            expect(codegraph.indexCodegraphOnStart).toBe(true);
        });

        it("offers a read-only preset that forbids writing files", async () => {
            const readonly = await service.get(READONLY_PRESET_ID);

            expect(readonly.disallowedTools).toEqual(["Write", "Edit", "NotebookEdit"]);
            expect(readonly.permissionMode).toBe("bypassPermissions");
        });

        it("offers an empty default preset", async () => {
            const defaultPreset = await service.get(DEFAULT_PRESET_ID);

            expect(defaultPreset).toMatchObject({
                mcpServers: [],
                allowedTools: [],
                disallowedTools: [],
                indexCodegraphOnStart: false,
            });
        });
    });

    describe("create", () => {
        it("stores a custom profile with the creation time", async () => {
            const input = buildInput({ allowedTools: ["Read", "Grep"] });

            const profile = await service.create(input);

            expect(profile).toEqual({
                ...input,
                id: expect.stringMatching(/^tlp_/) as unknown,
                builtin: false,
                createdAt: CREATED_AT.toISOString(),
                updatedAt: CREATED_AT.toISOString(),
            });
            await expect(service.get(profile.id)).resolves.toEqual(profile);
        });

        it("lists custom profiles after the presets, in creation order", async () => {
            await service.create(buildInput({ name: "Revisor" }));
            clock.advance(ONE_HOUR_MS);
            await service.create(buildInput({ name: "Planner" }));

            const profiles = await service.list();

            expect(profiles.slice(PRESET_IDS.length).map((profile) => profile.name)).toEqual([
                "Revisor",
                "Planner",
            ]);
        });

        it("rejects two MCP servers with the same name", async () => {
            const server = { name: "codegraph", command: "codegraph", args: [], env: {} };

            const creating = service.create(buildInput({ mcpServers: [server, server] }));

            await expect(creating).rejects.toThrow(DomainValidationError);
            await expect(creating).rejects.toThrow("codegraph");
        });

        it("accepts well-formed credential references in MCP env values", async () => {
            const server = {
                name: "github",
                command: "github-mcp",
                args: [],
                env: { GITHUB_TOKEN: "${cred:cred_01JC3Z8K2W5Q}" },
            };

            const profile = await service.create(buildInput({ mcpServers: [server] }));

            expect(profile.mcpServers).toEqual([server]);
        });

        it("rejects a malformed credential reference in an MCP env value", async () => {
            const server = {
                name: "github",
                command: "github-mcp",
                args: [],
                env: { GITHUB_TOKEN: "${cred:token do github}" },
            };

            const creating = service.create(buildInput({ mcpServers: [server] }));

            await expect(creating).rejects.toThrow(DomainValidationError);
        });
    });

    describe("get", () => {
        it("rejects an unknown id with NotFoundError", async () => {
            await expect(service.get("tlp_inexistente")).rejects.toThrow(NotFoundError);
        });
    });

    describe("update", () => {
        it("replaces the profile configuration and the update time", async () => {
            const created = await service.create(buildInput());
            clock.advance(ONE_HOUR_MS);
            const changes = buildInput({ name: "Revisor estrito", permissionMode: "plan" });

            const updated = await service.update(created.id, changes);

            expect(updated).toEqual({
                ...created,
                ...changes,
                updatedAt: new Date(CREATED_AT.getTime() + ONE_HOUR_MS).toISOString(),
            });
            await expect(service.get(created.id)).resolves.toEqual(updated);
        });

        it("refuses to edit a preset", async () => {
            const updating = service.update(CODEGRAPH_PRESET_ID, buildInput());

            await expect(updating).rejects.toThrow(ConflictError);
        });

        it("validates MCP names on update too", async () => {
            const created = await service.create(buildInput());
            const server = { name: "codegraph", command: "codegraph", args: [], env: {} };

            const updating = service.update(
                created.id,
                buildInput({ mcpServers: [server, server] }),
            );

            await expect(updating).rejects.toThrow(DomainValidationError);
        });

        it("rejects an unknown id with NotFoundError", async () => {
            await expect(service.update("tlp_inexistente", buildInput())).rejects.toThrow(
                NotFoundError,
            );
        });
    });

    describe("remove", () => {
        it("deletes a custom profile", async () => {
            const created = await service.create(buildInput());

            await service.remove(created.id);

            await expect(service.get(created.id)).rejects.toThrow(NotFoundError);
        });

        it("refuses to remove a preset", async () => {
            await expect(service.remove(READONLY_PRESET_ID)).rejects.toThrow(ConflictError);
            await expect(service.get(READONLY_PRESET_ID)).resolves.toMatchObject({
                builtin: true,
            });
        });
    });

    describe("duplicate", () => {
        it("copies a preset into an editable profile", async () => {
            const codegraph = await service.get(CODEGRAPH_PRESET_ID);

            const copy = await service.duplicate(CODEGRAPH_PRESET_ID);

            expect(copy).toEqual({
                ...codegraph,
                id: expect.stringMatching(/^tlp_/) as unknown,
                name: "CodeGraph (cópia)",
                builtin: false,
                createdAt: CREATED_AT.toISOString(),
                updatedAt: CREATED_AT.toISOString(),
            });
            await expect(service.update(copy.id, buildInput())).resolves.toMatchObject({
                name: "Revisor",
            });
        });

        it("keeps the copy name within the maximum length", async () => {
            const longName = "R".repeat(60);
            const created = await service.create(buildInput({ name: longName }));

            const copy = await service.duplicate(created.id);

            expect(copy.name).toHaveLength(60);
            expect(copy.name.endsWith(" (cópia)")).toBe(true);
        });

        it("rejects an unknown id with NotFoundError", async () => {
            await expect(service.duplicate("tlp_inexistente")).rejects.toThrow(NotFoundError);
        });
    });
});
