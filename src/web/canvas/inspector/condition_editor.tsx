import { Plus } from "lucide-react";
import { useId } from "react";
import type { JSX } from "react";

import type { Condition } from "@/shared/conditions.js";
import { ConditionRuleRow } from "@/web/canvas/inspector/condition_rule_row.js";
import type { RuleConnective } from "@/web/canvas/inspector/condition_rules.js";
import { conditionToText } from "@/web/canvas/inspector/condition_text.js";
import { useConditionRules } from "@/web/canvas/inspector/use_condition_rules.js";
import { Button } from "@/web/components/ui/button.js";
import { SegmentedControl } from "@/web/components/ui/segmented_control.js";

const CONNECTIVE_OPTIONS: { value: RuleConnective; label: string }[] = [
    { value: "and", label: "E" },
    { value: "or", label: "OU" },
];

export function ConditionEditor({
    value,
    onChange,
    suggestions,
}: {
    value: Condition;
    onChange: (condition: Condition) => void;
    suggestions: string[];
}): JSX.Element {
    const editing = useConditionRules(value, onChange);
    const suggestionListId = useId();
    const { conditionRules } = editing;

    if (!conditionRules) {
        return <ConditionBeyondRules condition={value} onRestart={editing.restartAsRules} />;
    }

    const canRemoveRules = conditionRules.rules.length > 1;

    return (
        <div className="flex flex-col gap-3">
            <SegmentedControl
                label="Combinar regras com"
                value={conditionRules.connective}
                options={CONNECTIVE_OPTIONS}
                onChange={editing.changeConnective}
            />
            {conditionRules.rules.map((rule, index) => (
                <ConditionRuleRow
                    key={index}
                    rule={rule}
                    ruleNumber={index + 1}
                    suggestionListId={suggestionListId}
                    onEdit={(changes) => editing.editRule(index, changes)}
                    onApply={(changes) => editing.applyRuleChanges(index, changes)}
                    onBlur={editing.applyEditedRules}
                    onRemove={canRemoveRules ? () => editing.removeRule(index) : undefined}
                />
            ))}
            <datalist id={suggestionListId}>
                {suggestions.map((path) => (
                    <option key={path} value={path} />
                ))}
            </datalist>
            {editing.error && (
                <p role="alert" className="text-xs text-status-failed">
                    {editing.error}
                </p>
            )}
            <Button variant="ghost" onClick={editing.addRule} className="self-start">
                <Plus aria-hidden className="size-4" />
                Adicionar regra
            </Button>
        </div>
    );
}

function ConditionBeyondRules({
    condition,
    onRestart,
}: {
    condition: Condition;
    onRestart: () => void;
}): JSX.Element {
    return (
        <div className="flex flex-col gap-2 text-sm">
            <p className="font-mono">{conditionToText(condition)}</p>
            <p className="text-muted">Esta condição não cabe em uma lista de regras.</p>
            <Button onClick={onRestart} className="self-start">
                Recomeçar como regras
            </Button>
        </div>
    );
}
