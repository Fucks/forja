import { useState } from "react";

import type { DataField } from "@/engine/available_data.js";
import type { Condition } from "@/shared/conditions.js";
import type { OperatorOption } from "@/web/canvas/inspector/condition_operators.js";
import { withOperatorOption, withRulePath } from "@/web/canvas/inspector/condition_rule_edits.js";
import { toCondition, toConditionRules } from "@/web/canvas/inspector/condition_rules.js";
import type {
    ConditionRule,
    ConditionRules,
    RuleConnective,
    RuleValueChanges,
} from "@/web/canvas/inspector/condition_rules.js";
import { conditionToText } from "@/web/canvas/inspector/condition_text.js";

export interface ConditionRulesEditing {
    conditionRules: ConditionRules | undefined;
    error: string | undefined;
    typeRulePath: (index: number, path: string) => void;
    pickRulePath: (index: number, path: string) => void;
    chooseRuleOperator: (index: number, option: OperatorOption) => void;
    editRuleValue: (index: number, changes: RuleValueChanges) => void;
    applyRuleValue: (index: number, changes: RuleValueChanges) => void;
    applyEditedRules: () => void;
    changeConnective: (connective: RuleConnective) => void;
    addRule: () => void;
    removeRule: (index: number) => void;
    restartAsRules: () => void;
}

type RuleEdit = (rule: ConditionRule) => ConditionRule;

const EMPTY_RULE: ConditionRule = { path: "", operator: "eq", valueText: "", values: [] };

// Edits stay local until they form a valid condition; only then the node receives it.
export function useConditionRules(
    condition: Condition,
    fields: DataField[],
    onChange: (condition: Condition) => void,
): ConditionRulesEditing {
    const [conditionRules, setConditionRules] = useState(() => toConditionRules(condition));
    const [error, setError] = useState<string>();

    function applyRules(nextRules: ConditionRules): void {
        setConditionRules(nextRules);
        const conversion = toCondition(nextRules, fields);
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
    const editRule = (index: number, edit: RuleEdit): void =>
        setConditionRules(withEditedRule(currentRules, index, edit));
    const applyRule = (index: number, edit: RuleEdit): void =>
        applyRules(withEditedRule(currentRules, index, edit));

    return {
        conditionRules,
        error,
        typeRulePath: (index, path) => editRule(index, (rule) => withRulePath(rule, path, fields)),
        pickRulePath: (index, path) => applyRule(index, (rule) => withRulePath(rule, path, fields)),
        chooseRuleOperator: (index, option) =>
            applyRule(index, (rule) => withOperatorOption(rule, option, fields)),
        editRuleValue: (index, changes) => editRule(index, (rule) => ({ ...rule, ...changes })),
        applyRuleValue: (index, changes) => applyRule(index, (rule) => ({ ...rule, ...changes })),
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

function withEditedRule(
    conditionRules: ConditionRules,
    index: number,
    edit: RuleEdit,
): ConditionRules {
    const rules = conditionRules.rules.map((rule, ruleIndex) =>
        ruleIndex === index ? edit(rule) : rule,
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
