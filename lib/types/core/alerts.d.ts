import type { EcoDb } from './db.ts';
export type AlertType = 'growth-pct' | 'new-repo' | 'mapping-unmatched';
export interface AlertRule {
    id: string;
    type: AlertType;
    threshold: number | null;
    minPrev: number | null;
    maxAgeDays: number | null;
    segment: string | null;
}
export interface AlertEvent {
    ruleId: string;
    repoId: string;
    date: string;
    type: AlertType;
    message: string;
    payload: Record<string, unknown>;
}
export interface AlertRun {
    date: string | null;
    fired: AlertEvent[];
    suppressed: number;
    skipped: string[];
}
export declare function parseAlertRules(text: string): AlertRule[];
export declare function loadAlertRules(path: string | null): AlertRule[];
export declare function evaluateAlerts(db: EcoDb, rules: readonly AlertRule[], options?: {
    date?: string;
    now?: Date;
    dryRun?: boolean;
}): AlertRun;
export interface DeliveryResult {
    attempted: boolean;
    ok: boolean;
    status: number | null;
    error: string | null;
}
export declare function deliverWebhook(url: string, run: AlertRun, fetchImpl?: typeof fetch): Promise<DeliveryResult>;
//# sourceMappingURL=alerts.d.ts.map