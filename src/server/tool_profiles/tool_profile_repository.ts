import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import type { ForjaDb } from "@/server/db/client.js";
import { toolProfiles } from "@/server/db/schema/tool_profiles.js";
import type { ToolProfileRow } from "@/server/db/schema/tool_profiles.js";
import { PERMISSION_MODES } from "@/shared/agent_types.js";
import { mcpServerSchema } from "@/shared/tool_profile_types.js";
import type { ToolProfile } from "@/shared/tool_profile_types.js";

const mcpServersSchema = z.array(mcpServerSchema);
const toolRulesSchema = z.array(z.string());
const permissionModeSchema = z.enum(PERMISSION_MODES);

// Only user-created profiles are stored; the builtin presets live in code.
export class ToolProfileRepository {
    constructor(private readonly db: ForjaDb) {}

    insert(profile: ToolProfile): void {
        this.db.insert(toolProfiles).values(toToolProfileRow(profile)).run();
    }

    list(): ToolProfile[] {
        return this.db
            .select()
            .from(toolProfiles)
            .orderBy(asc(toolProfiles.createdAt))
            .all()
            .map(toToolProfile);
    }

    findById(id: string): ToolProfile | undefined {
        const row = this.db.select().from(toolProfiles).where(eq(toolProfiles.id, id)).get();
        return row && toToolProfile(row);
    }

    update(profile: ToolProfile): void {
        this.db
            .update(toolProfiles)
            .set(toToolProfileRow(profile))
            .where(eq(toolProfiles.id, profile.id))
            .run();
    }

    delete(id: string): void {
        this.db.delete(toolProfiles).where(eq(toolProfiles.id, id)).run();
    }
}

function toToolProfileRow(profile: ToolProfile): ToolProfileRow {
    return {
        id: profile.id,
        name: profile.name,
        description: profile.description,
        mcpServersJson: JSON.stringify(profile.mcpServers),
        allowedToolsJson: JSON.stringify(profile.allowedTools),
        disallowedToolsJson: JSON.stringify(profile.disallowedTools),
        permissionMode: profile.permissionMode,
        indexCodegraphOnStart: profile.indexCodegraphOnStart,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
    };
}

function toToolProfile(row: ToolProfileRow): ToolProfile {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        mcpServers: mcpServersSchema.parse(JSON.parse(row.mcpServersJson)),
        allowedTools: toolRulesSchema.parse(JSON.parse(row.allowedToolsJson)),
        disallowedTools: toolRulesSchema.parse(JSON.parse(row.disallowedToolsJson)),
        permissionMode: permissionModeSchema.parse(row.permissionMode),
        indexCodegraphOnStart: row.indexCodegraphOnStart,
        builtin: false,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
