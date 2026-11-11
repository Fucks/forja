import { Trash2 } from "lucide-react";
import type { JSX } from "react";

import type { ConditionRule } from "@/web/canvas/inspector/condition_rules.js";
import { COMPARISON_OPERATOR_SYMBOLS } from "@/web/canvas/inspector/condition_text.js";
import type { ComparisonOperator } from "@/web/canvas/inspector/condition_text.js";
import { IconButton } from "@/web/components/ui/icon_button.js";
import { Input } from "@/web/components/ui/input.js";
import { SegmentedControl } from "@/web/components/ui/segmented_control.js";

const COMPARISON_OPERATORS: ComparisonOperator[] = ["eq", "neq", "gt", "lt", "exists"];
const OPERATOR_OPTIONS = COMPARISON_OPERATORS.map((operator) => ({
    value: operator,
    label: COMPARISON_OPERATOR_SYMBOLS[operator],
}));

interface ConditionRuleRowProps {
    rule: ConditionRule;
    ruleNumber: number;
    suggestionListId: string;
    onEdit: (changes: Partial<ConditionRule>) => void;
    onApply: (changes: Partial<ConditionRule>) => void;
    onBlur: () => void;
    onRemove: (() => void) | undefined;
}

// Typing only edits the row; the rule is applied when a field loses focus or the operator changes.
export function ConditionRuleRow({
    rule,
    ruleNumber,
    suggestionListId,
    onEdit,
    onApply,
    onBlur,
    onRemove,
}: ConditionRuleRowProps): JSX.Element {
    const ruleName = `regra ${ruleNumber}`;

    return (
        <fieldset aria-label={`Regra ${ruleNumber}`} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
                <Input
                    aria-label={`Caminho da ${ruleName}`}
                    value={rule.path}
                    list={suggestionListId}
                    placeholder="review.approved"
                    mono
                    onChange={(event) => onEdit({ path: event.target.value })}
                    onBlur={onBlur}
                />
                {onRemove && (
                    <IconButton label={`Remover ${ruleName}`} icon={Trash2} onClick={onRemove} />
                )}
            </div>
            <div className="flex items-center gap-1">
                <SegmentedControl
                    label={`Operador da ${ruleName}`}
                    value={rule.operator}
                    options={OPERATOR_OPTIONS}
                    onChange={(operator) => onApply({ operator })}
                />
                {rule.operator !== "exists" && (
                    <Input
                        aria-label={`Valor da ${ruleName}`}
                        value={rule.valueText}
                        placeholder="true"
                        mono
                        onChange={(event) => onEdit({ valueText: event.target.value })}
                        onBlur={onBlur}
                    />
                )}
            </div>
        </fieldset>
    );
}
