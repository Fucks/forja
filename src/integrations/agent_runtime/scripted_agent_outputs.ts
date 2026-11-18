import { z } from "zod";

export const scriptedOutputRuleSchema = z.object({
    promptIncludes: z.string().min(1),
    /** Given one per matching run, in order; the last one keeps being given after that. */
    outputs: z.array(z.unknown()).min(1),
});

export type ScriptedOutputRule = z.infer<typeof scriptedOutputRuleSchema>;

export type ScriptedOutput = { isScripted: true; output: unknown } | { isScripted: false };

/** What the simulated agents answer in place of the minimal value of their output schema. */
export interface ScriptedAgentOutputs {
    replaceRules(rules: ScriptedOutputRule[]): void;
    takeNext(prompt: string): ScriptedOutput;
}

interface RuleProgress {
    rule: ScriptedOutputRule;
    givenCount: number;
}

const NOT_SCRIPTED: ScriptedOutput = { isScripted: false };

export function createScriptedAgentOutputs(): ScriptedAgentOutputs {
    let progresses: RuleProgress[] = [];

    return {
        replaceRules(rules) {
            progresses = rules.map((rule) => ({ rule, givenCount: 0 }));
        },

        takeNext(prompt) {
            const progress = progresses.find(({ rule }) => prompt.includes(rule.promptIncludes));
            if (!progress) {
                return NOT_SCRIPTED;
            }

            const output = nextOutputOf(progress);
            progress.givenCount += 1;
            return { isScripted: true, output };
        },
    };
}

function nextOutputOf({ rule, givenCount }: RuleProgress): unknown {
    const lastIndex = rule.outputs.length - 1;

    return rule.outputs[Math.min(givenCount, lastIndex)];
}
