export type DiagnosticStatus = "ok" | "warning" | "error";

export interface DiagnosticItem {
    id: string;
    label: string;
    status: DiagnosticStatus;
    detail: string;
    fix?: string;
}

export interface DiagnosticReport {
    checkedAt: string;
    items: DiagnosticItem[];
}
