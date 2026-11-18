import { createScriptedAgentOutputs } from "@/integrations/agent_runtime/scripted_agent_outputs.js";

const REVIEWER_PROMPT = "Revise as mudanças do Dev.";
const REJECTED = { approved: false, notes: "Faltam testes." };
const APPROVED = { approved: true, notes: "" };

describe("ScriptedAgentOutputs", () => {
    it("gives the outputs of the matching rule in order", () => {
        const outputs = createScriptedAgentOutputs();
        outputs.replaceRules([{ promptIncludes: "Revise", outputs: [REJECTED, APPROVED] }]);

        const answers = [outputs.takeNext(REVIEWER_PROMPT), outputs.takeNext(REVIEWER_PROMPT)];

        expect(answers).toEqual([
            { isScripted: true, output: REJECTED },
            { isScripted: true, output: APPROVED },
        ]);
    });

    it("keeps repeating the last output once the others were given", () => {
        const outputs = createScriptedAgentOutputs();
        outputs.replaceRules([{ promptIncludes: "Revise", outputs: [REJECTED, APPROVED] }]);
        outputs.takeNext(REVIEWER_PROMPT);
        outputs.takeNext(REVIEWER_PROMPT);

        const answer = outputs.takeNext(REVIEWER_PROMPT);

        expect(answer).toEqual({ isScripted: true, output: APPROVED });
    });

    it("scripts nothing for a prompt that no rule matches", () => {
        const outputs = createScriptedAgentOutputs();
        outputs.replaceRules([{ promptIncludes: "Revise", outputs: [APPROVED] }]);

        const answer = outputs.takeNext("Implemente o item.");

        expect(answer).toEqual({ isScripted: false });
    });

    it("starts the new rules from their first output", () => {
        const outputs = createScriptedAgentOutputs();
        const rules = [{ promptIncludes: "Revise", outputs: [REJECTED, APPROVED] }];
        outputs.replaceRules(rules);
        outputs.takeNext(REVIEWER_PROMPT);

        outputs.replaceRules(rules);

        expect(outputs.takeNext(REVIEWER_PROMPT)).toEqual({ isScripted: true, output: REJECTED });
    });

    it("scripts nothing before any rule is given", () => {
        const outputs = createScriptedAgentOutputs();

        expect(outputs.takeNext(REVIEWER_PROMPT)).toEqual({ isScripted: false });
    });
});
