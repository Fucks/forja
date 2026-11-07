import { useState } from "react";
import type { JSX } from "react";

import { SampleRow, StyleguideSection } from "@/web/app/styleguide/styleguide_section.js";
import { Field } from "@/web/components/ui/field.js";
import { Input } from "@/web/components/ui/input.js";
import { Select } from "@/web/components/ui/select.js";
import { Textarea } from "@/web/components/ui/textarea.js";

type ModelName = "opus" | "sonnet" | "haiku";

const MODEL_OPTIONS: { value: ModelName; label: string; hint?: string }[] = [
    { value: "opus", label: "Opus", hint: "mais capaz" },
    { value: "sonnet", label: "Sonnet" },
    { value: "haiku", label: "Haiku", hint: "mais rápido" },
];

export function TextFieldSamples(): JSX.Element {
    return (
        <StyleguideSection title="Field, Input e Textarea">
            <div className="grid max-w-3xl grid-cols-2 gap-4">
                <Field
                    label="Nome do fluxo"
                    hint="Aparece no board e nos runs."
                    htmlFor="sample-name"
                >
                    <Input placeholder="Revisão de PR" />
                </Field>
                <Field label="Branch base" error="Informe uma branch." htmlFor="sample-branch">
                    <Input mono defaultValue="" />
                </Field>
                <Field label="Diretório" htmlFor="sample-directory">
                    <Input mono disabled defaultValue="/home/forja/projeto" />
                </Field>
                <Field label="Prompt" htmlFor="sample-prompt">
                    <Textarea mono defaultValue="Revise o diff de {{pr.number}}." />
                </Field>
            </div>
        </StyleguideSection>
    );
}

export function SelectSamples(): JSX.Element {
    const [model, setModel] = useState<ModelName>("sonnet");

    return (
        <StyleguideSection title="Select">
            <div className="flex max-w-3xl gap-4">
                <SampleRow label="Padrão">
                    <Select value={model} onChange={setModel} options={MODEL_OPTIONS} />
                </SampleRow>
                <SampleRow label="Inválido">
                    <Select value={model} onChange={setModel} options={MODEL_OPTIONS} invalid />
                </SampleRow>
            </div>
        </StyleguideSection>
    );
}
