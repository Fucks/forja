import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { scriptedOutputRuleSchema } from "@/integrations/agent_runtime/scripted_agent_outputs.js";
import type { RouteModule } from "@/server/route_modules.js";

const NO_CONTENT_STATUS = 204;

const scriptedOutputsBodySchema = z.object({ rules: z.array(scriptedOutputRuleSchema) });

// Lets the E2E decide what the simulated agents answer, such as a Reviewer that rejects once.
export const registerScriptedAgentsRoutes: RouteModule = (app, deps) => {
    const outputs = deps.scriptedAgentOutputs;
    if (!outputs) {
        return;
    }

    app.withTypeProvider<ZodTypeProvider>().put(
        "/scripted-agents/outputs",
        { schema: { body: scriptedOutputsBodySchema } },
        async (request, reply) => {
            outputs.replaceRules(request.body.rules);
            return reply.code(NO_CONTENT_STATUS).send();
        },
    );
};
