import type { JSX, ReactNode } from "react";

import { EFFORTS } from "@/shared/agent_types.js";
import type { Effort } from "@/shared/agent_types.js";
import type { CredentialKind } from "@/shared/credential_types.js";
import { DEFAULT_PROJECT_SETTINGS } from "@/shared/settings_types.js";
import type { ProjectSettingsDraft } from "@/web/app/projects/settings_draft.js";
import {
    SettingField,
    SettingsSection,
    describeDefault,
} from "@/web/app/projects/settings_section.js";
import { useCredentials } from "@/web/app/settings/use_credentials.js";
import { useToolProfiles } from "@/web/app/settings/use_tool_profiles.js";
import { Field } from "@/web/components/ui/field.js";
import { SegmentedControl } from "@/web/components/ui/segmented_control.js";
import { Select } from "@/web/components/ui/select.js";
import { Textarea } from "@/web/components/ui/textarea.js";

type ChangeProjectField = <Key extends keyof ProjectSettingsDraft>(
    field: Key,
    fieldValue: ProjectSettingsDraft[Key],
) => void;

interface ProjectSectionProps {
    draft: ProjectSettingsDraft;
    onFieldChange: ChangeProjectField;
}

const AGENT_CREDENTIAL_KINDS: CredentialKind[] = ["anthropic_api_key", "claude_oauth_token"];
const GITHUB_CREDENTIAL_KINDS: CredentialKind[] = ["github_token"];
const NO_CREDENTIAL = "none";
const NO_DAILY_BUDGET_LABEL = "sem limite";
const EFFORT_OPTIONS = EFFORTS.map((effort) => ({ value: effort, label: effort }));

export function ProjectSettingsForm({
    draft,
    onChange,
    containerPanel,
}: {
    draft: ProjectSettingsDraft;
    onChange: (draft: ProjectSettingsDraft) => void;
    containerPanel: ReactNode;
}): JSX.Element {
    const changeField: ChangeProjectField = (field, fieldValue) =>
        onChange({ ...draft, [field]: fieldValue });

    return (
        <>
            <AgentsSection draft={draft} onFieldChange={changeField} />
            <ExecutionSection draft={draft} onFieldChange={changeField} />
            <ContainerSection draft={draft} onFieldChange={changeField}>
                {containerPanel}
            </ContainerSection>
        </>
    );
}

function AgentsSection({ draft, onFieldChange }: ProjectSectionProps): JSX.Element {
    return (
        <SettingsSection title="Agentes">
            <Field label="Credencial dos agentes" htmlFor="project-settings-credential">
                <CredentialSelect
                    credentialId={draft.defaultCredentialId}
                    kinds={AGENT_CREDENTIAL_KINDS}
                    onChange={(credentialId) => onFieldChange("defaultCredentialId", credentialId)}
                />
            </Field>
            <Field label="Credencial do GitHub" htmlFor="project-settings-github-credential">
                <CredentialSelect
                    credentialId={draft.githubCredentialId}
                    kinds={GITHUB_CREDENTIAL_KINDS}
                    onChange={(credentialId) => onFieldChange("githubCredentialId", credentialId)}
                />
            </Field>
            <SettingField
                label="Modelo"
                mono
                fieldText={draft.defaultModel}
                defaultLabel={DEFAULT_PROJECT_SETTINGS.defaultModel}
                onChange={(fieldText) => onFieldChange("defaultModel", fieldText)}
            />
            <ToolProfileField
                toolProfileId={draft.defaultToolProfileId}
                onChange={(toolProfileId) => onFieldChange("defaultToolProfileId", toolProfileId)}
            />
            <EffortField
                effort={draft.defaultEffort}
                onChange={(effort) => onFieldChange("defaultEffort", effort)}
            />
            <Field
                label="System prompt"
                htmlFor="project-settings-system-prompt"
                hint="Anexado ao prompt de todo nó de agente do projeto."
            >
                <Textarea
                    mono
                    value={draft.systemPrompt}
                    onChange={(event) => onFieldChange("systemPrompt", event.target.value)}
                />
            </Field>
        </SettingsSection>
    );
}

function CredentialSelect({
    credentialId,
    kinds,
    onChange,
}: {
    credentialId: string | null;
    kinds: CredentialKind[];
    onChange: (credentialId: string | null) => void;
}): JSX.Element {
    const credentialsQuery = useCredentials();
    const credentialOptions = (credentialsQuery.data ?? [])
        .filter((credential) => kinds.includes(credential.kind))
        .map((credential) => ({ value: credential.id, label: credential.name }));

    return (
        <Select
            value={credentialId ?? NO_CREDENTIAL}
            options={[{ value: NO_CREDENTIAL, label: "Nenhuma" }, ...credentialOptions]}
            onChange={(selected) => onChange(selected === NO_CREDENTIAL ? null : selected)}
        />
    );
}

function ToolProfileField({
    toolProfileId,
    onChange,
}: {
    toolProfileId: string;
    onChange: (toolProfileId: string) => void;
}): JSX.Element {
    const toolProfiles = useToolProfiles().data ?? [];
    const toolProfileOptions = toolProfiles.map((profile) => ({
        value: profile.id,
        label: profile.name,
    }));
    const defaultProfile = toolProfiles.find(
        (profile) => profile.id === DEFAULT_PROJECT_SETTINGS.defaultToolProfileId,
    );

    return (
        <Field
            label="Perfil de ferramentas"
            htmlFor="project-settings-tool-profile"
            hint={describeDefault(
                defaultProfile?.name ?? DEFAULT_PROJECT_SETTINGS.defaultToolProfileId,
            )}
        >
            <Select value={toolProfileId} options={toolProfileOptions} onChange={onChange} />
        </Field>
    );
}

function EffortField({
    effort,
    onChange,
}: {
    effort: Effort;
    onChange: (effort: Effort) => void;
}): JSX.Element {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-text">Effort</span>
            <SegmentedControl
                label="Effort"
                value={effort}
                options={EFFORT_OPTIONS}
                onChange={onChange}
            />
            <p className="text-xs text-muted">
                {describeDefault(DEFAULT_PROJECT_SETTINGS.defaultEffort)}
            </p>
        </div>
    );
}

function ExecutionSection({ draft, onFieldChange }: ProjectSectionProps): JSX.Element {
    return (
        <SettingsSection title="Execução">
            <SettingField
                label="Agentes em paralelo"
                inputType="number"
                fieldText={draft.maxConcurrentAgents}
                defaultLabel={DEFAULT_PROJECT_SETTINGS.maxConcurrentAgents}
                onChange={(fieldText) => onFieldChange("maxConcurrentAgents", fieldText)}
            />
            <SettingField
                label="Orçamento diário (US$)"
                inputType="number"
                fieldText={draft.dailyBudgetUsd}
                defaultLabel={NO_DAILY_BUDGET_LABEL}
                onChange={(fieldText) => onFieldChange("dailyBudgetUsd", fieldText)}
            />
            <SettingField
                label="Fuso horário"
                mono
                fieldText={draft.timezone}
                defaultLabel={DEFAULT_PROJECT_SETTINGS.timezone}
                onChange={(fieldText) => onFieldChange("timezone", fieldText)}
            />
        </SettingsSection>
    );
}

function ContainerSection({
    draft,
    onFieldChange,
    children,
}: ProjectSectionProps & { children: ReactNode }): JSX.Element {
    return (
        <SettingsSection title="Container">
            <SettingField
                label="Imagem Docker"
                mono
                fieldText={draft.agentImage}
                defaultLabel={DEFAULT_PROJECT_SETTINGS.agentImage}
                onChange={(fieldText) => onFieldChange("agentImage", fieldText)}
            />
            {children}
        </SettingsSection>
    );
}
