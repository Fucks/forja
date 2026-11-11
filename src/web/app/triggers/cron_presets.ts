export const CUSTOM_CRON_PRESET = "custom";

export interface CronPreset {
    value: string;
    label: string;
}

export const CRON_PRESETS: CronPreset[] = [
    { value: "0 22 * * *", label: "Todo dia às 22:00" },
    { value: "0 8 * * 1-5", label: "Dias úteis às 08:00" },
    { value: "0 * * * *", label: "A cada hora" },
    { value: "*/30 * * * *", label: "A cada 30 minutos" },
    { value: CUSTOM_CRON_PRESET, label: "Personalizado" },
];

export function findCronPresetValue(cron: string): string {
    const preset = CRON_PRESETS.find((candidate) => candidate.value === cron.trim());

    return preset?.value ?? CUSTOM_CRON_PRESET;
}
