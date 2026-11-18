import { useId } from "react";
import type { JSX } from "react";
import { z } from "zod";

import { isNodeOfType } from "@/shared/flow_graph.js";
import { GATE_REVIEW_SECTIONS } from "@/shared/node_configs/gate_config.js";
import type { GateConfig } from "@/shared/node_configs/gate_config.js";
import { fieldDoc, fieldOptionCards } from "@/web/canvas/inspector/field_doc.js";
import { FieldHeading } from "@/web/canvas/inspector/field_heading.js";
import { GatePreview } from "@/web/canvas/inspector/gate_preview.js";
import type { GateReviewSection } from "@/web/canvas/inspector/gate_preview.js";
import type { InspectorProps } from "@/web/canvas/inspector/inspector_registry.js";
import { InspectorFields } from "@/web/canvas/inspector/inspector_section.js";
import { IntegerField } from "@/web/canvas/inspector/integer_field.js";
import { NodeInspectorFrame } from "@/web/canvas/inspector/node_inspector_frame.js";
import { withNodeConfig } from "@/web/canvas/inspector/node_updates.js";
import type { OptionCard } from "@/web/canvas/inspector/option_cards.js";
import { TextAreaField } from "@/web/canvas/inspector/text_field.js";
import { cn } from "@/web/components/ui/cn.js";
import { FOCUS_RING_CLASSES } from "@/web/components/ui/control_styles.js";

const SHOW_DOC = fieldDoc("gate", "show");
const REVIEW_SECTION_OPTIONS = fieldOptionCards(SHOW_DOC, GATE_REVIEW_SECTIONS);

const MIN_GATE_TIMEOUT_HOURS = 1;
// The form asks for whole hours, a stricter subset of the positive hours the gate accepts.
const GATE_TIMEOUT_HOURS_SCHEMA = z.int().min(MIN_GATE_TIMEOUT_HOURS).optional();

export function GateInspector({ node, graph, onChange }: InspectorProps): JSX.Element {
    // The registry routes only gates here; the check narrows the node to its gate config.
    if (!isNodeOfType(node, "gate")) {
        return <></>;
    }

    const { config } = node;
    const changeConfig = (changes: Partial<GateConfig>): void =>
        onChange((current) => withNodeConfig(current, "gate", changes));

    return (
        <NodeInspectorFrame node={node} graph={graph} onChange={onChange}>
            <InspectorFields>
                <TextAreaField
                    doc={fieldDoc("gate", "message")}
                    text={config.message}
                    placeholder="O que a pessoa deve conferir antes de aprovar"
                    onChange={(message) => changeConfig({ message })}
                />
                <div className="flex flex-col gap-1.5">
                    <FieldHeading doc={SHOW_DOC} />
                    {REVIEW_SECTION_OPTIONS.map((option) => (
                        <DescribedCheckbox
                            key={option.value}
                            option={option}
                            checked={config.show.includes(option.value)}
                            onChange={(isShown) =>
                                changeConfig({
                                    show: toggleSection(config.show, option.value, isShown),
                                })
                            }
                        />
                    ))}
                </div>
                <IntegerField
                    doc={fieldDoc("gate", "timeoutHours")}
                    value={config.timeoutHours}
                    schema={GATE_TIMEOUT_HOURS_SCHEMA}
                    limits={{ min: MIN_GATE_TIMEOUT_HOURS }}
                    onChange={(timeoutHours) => changeConfig({ timeoutHours })}
                />
                <GatePreview config={config} sectionOptions={REVIEW_SECTION_OPTIONS} />
            </InspectorFields>
        </NodeInspectorFrame>
    );
}

function toggleSection(
    shownSections: GateReviewSection[],
    section: GateReviewSection,
    isShown: boolean,
): GateReviewSection[] {
    return GATE_REVIEW_SECTIONS.filter((candidate) =>
        candidate === section ? isShown : shownSections.includes(candidate),
    );
}

function DescribedCheckbox({
    option,
    checked,
    onChange,
}: {
    option: OptionCard<GateReviewSection>;
    checked: boolean;
    onChange: (checked: boolean) => void;
}): JSX.Element {
    const checkboxId = useId();
    const descriptionId = useId();

    return (
        <div className="flex items-start gap-2">
            <input
                id={checkboxId}
                type="checkbox"
                aria-describedby={descriptionId}
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                className={cn("mt-0.5 size-4 accent-accent", FOCUS_RING_CLASSES)}
            />
            <div className="flex flex-col">
                <label htmlFor={checkboxId} className="text-sm text-text">
                    {option.label}
                </label>
                <span id={descriptionId} className="text-xs text-muted">
                    {option.description}
                </span>
            </div>
        </div>
    );
}
