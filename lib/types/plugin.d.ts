/** dsh wiring for eco-scan v2. The plugin is a thin shell: every command and
 * tool delegates to eco-core, which owns storage, collection, scoring and
 * export. `dataDir` stays the v1 location (`~/.dsh/eco-scan`), and the first
 * v2 run imports any `snapshots-*.jsonl` it finds there. */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "eco-scan";
export declare const inject: string[];
export interface Config {
    enabled: boolean;
    dataDir?: string;
    tokenEnv: string[];
    topGrowth: number;
    ecoVersion: 'v1' | 'v2';
    autoMigrate: boolean;
    resume: boolean;
    releaseBudget: number;
    detailsTtlHours: number;
    releaseTtlHours: number;
    alertsWebhook?: string;
    schedule: string;
    scheduleAlerts: boolean;
    scheduleOnStart: boolean;
}
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    enabled: Schema<boolean, boolean, "defined">;
    dataDir: Schema<string, string, "plain">;
    tokenEnv: Schema<string[], string[], "defined">;
    topGrowth: Schema<number, number, "defined">;
    ecoVersion: Schema<string, string, "defined">;
    autoMigrate: Schema<boolean, boolean, "defined">;
    resume: Schema<boolean, boolean, "defined">;
    releaseBudget: Schema<number, number, "defined">;
    detailsTtlHours: Schema<number, number, "defined">;
    releaseTtlHours: Schema<number, number, "defined">;
    alertsWebhook: Schema<string, string, "plain">;
    schedule: Schema<string, string, "defined">;
    scheduleAlerts: Schema<boolean, boolean, "defined">;
    scheduleOnStart: Schema<boolean, boolean, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: Schema<boolean, boolean, "defined">;
    dataDir: Schema<string, string, "plain">;
    tokenEnv: Schema<string[], string[], "defined">;
    topGrowth: Schema<number, number, "defined">;
    ecoVersion: Schema<string, string, "defined">;
    autoMigrate: Schema<boolean, boolean, "defined">;
    resume: Schema<boolean, boolean, "defined">;
    releaseBudget: Schema<number, number, "defined">;
    detailsTtlHours: Schema<number, number, "defined">;
    releaseTtlHours: Schema<number, number, "defined">;
    alertsWebhook: Schema<string, string, "plain">;
    schedule: Schema<string, string, "defined">;
    scheduleAlerts: Schema<boolean, boolean, "defined">;
    scheduleOnStart: Schema<boolean, boolean, "defined">;
}>>, "plain">;
export declare function apply(ctx: Context, configInput: Config): void;
//# sourceMappingURL=plugin.d.ts.map