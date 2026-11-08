import { X } from "lucide-react";
import { useState } from "react";
import type { JSX, KeyboardEvent } from "react";

import { Input } from "@/web/components/ui/input.js";

const ADD_RULE_KEY = "Enter";

export function ToolRulesInput({
    id,
    rules,
    onChange,
    placeholder,
}: {
    id: string;
    rules: string[];
    onChange: (rules: string[]) => void;
    placeholder: string;
}): JSX.Element {
    const [pendingRule, setPendingRule] = useState("");

    function addPendingRuleOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
        if (event.key !== ADD_RULE_KEY) {
            return;
        }

        event.preventDefault();
        const rule = pendingRule.trim();
        if (rule !== "" && !rules.includes(rule)) {
            onChange([...rules, rule]);
        }
        setPendingRule("");
    }

    return (
        <div className="flex flex-col gap-1.5">
            {rules.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                    {rules.map((rule) => (
                        <ToolRuleChip
                            key={rule}
                            rule={rule}
                            onRemove={() => onChange(rules.filter((kept) => kept !== rule))}
                        />
                    ))}
                </ul>
            )}
            <Input
                id={id}
                mono
                value={pendingRule}
                placeholder={placeholder}
                onChange={(event) => setPendingRule(event.target.value)}
                onKeyDown={addPendingRuleOnEnter}
            />
        </div>
    );
}

function ToolRuleChip({ rule, onRemove }: { rule: string; onRemove: () => void }): JSX.Element {
    return (
        <li className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-xs">
            {rule}
            <button
                type="button"
                aria-label={`Remover ${rule}`}
                onClick={onRemove}
                className="text-muted hover:text-text"
            >
                <X aria-hidden className="size-3" />
            </button>
        </li>
    );
}
