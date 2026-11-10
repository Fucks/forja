import { useState } from "react";

import type { Condition } from "@/shared/conditions.js";
import { toCondition, toConditionRules } from "@/web/canvas/inspector/condition_rules.js";
import type {
    ConditionRule,
    ConditionRules,
    RuleConnective,
} from "@/web/canvas/inspector/condition_rules.js";
import { conditionToText } from "@/web/canvas/inspector/condition_text.js";

export interface ConditionRulesEditing {
    conditionRules: ConditionRules | undefined;
    error: string | undefined;
    editRule: (index: number, changes: Partial<ConditionRule>) => void;
    changeRule: (index: number, changes: Partial<ConditionRule>) => void;
    applyEditedRules: () => void;
    changeConnective: (connective: RuleConnective) => void;
    addRule: () => void;
    removeRule: (index: number) => void;
    restartAsRules: () => void;
}

const EMPTY_RULE: ConditionRule = { path: "", operator: "eq", valueText: "" };

// Edits stay local until they form a valid condition; only then the node receives it.
export function useConditionRules(
    condition: Condition,
    onChange: (condition: Condition) => void,
): ConditionRulesEditing {
    const [conditionRules, setConditionRules] = useState(() => toConditionRules(condition));
    const [error, setError] = useState<string>();

    function applyRules(nextRules: ConditionRules): void {
        setConditionRules(nextRules);
        const conversion = toCondition(nextRules);
        if (!conversion.ok) {
            setError(conversion.error);
            return;
        }

        setError(undefined);
        if (!describesSameCondition(conversion.condition, condition)) {
            onChange(conversion.condition);
        }
    }

    const currentRules = conditionRules ?? startRules();

    return {
        conditionRules,
        error,
        editRule: (index, changes) =>
            setConditionRules(withRuleChanges(currentRules, index, changes)),
        changeRule: (index, changes) => applyRules(withRuleChanges(currentRules, index, changes)),
        applyEditedRules: () => applyRules(currentRules),
        changeConnective: (connective) => applyRules({ ...currentRules, connective }),
        addRule: () =>
            setConditionRules({ ...currentRules, rules: [...currentRules.rules, EMPTY_RULE] }),
        removeRule: (index) => applyRules(withoutRule(currentRules, index)),
        restartAsRules: () => setConditionRules(startRules()),
    };
}

function startRules(): ConditionRules {
    return { connective: "and", rules: [EMPTY_RULE] };
}

function withRuleChanges(
    conditionRules: ConditionRules,
    index: number,
    changes: Partial<ConditionRule>,
): ConditionRules {
    const rules = conditionRules.rules.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, ...changes } : rule,
    );

    return { ...conditionRules, rules };
}

function withoutRule(conditionRules: ConditionRules, index: number): ConditionRules {
    const rules = conditionRules.rules.filter((_rule, ruleIndex) => ruleIndex !== index);

    return { ...conditionRules, rules };
}

// The text spells out every path, operator and typed value, so equal texts mean equal conditions.
function describesSameCondition(first: Condition, second: Condition): boolean {
    return conditionToText(first) === conditionToText(second);
}
