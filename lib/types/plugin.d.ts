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
export declare const Config: Schema<Schemastery.ObjectS<{
    enabled: Schema<boolean, boolean>;
    dataDir: Schema<string, string>;
    tokenEnv: Schema<string[], string[]>;
    topGrowth: Schema<number, number>;
    ecoVersion: Schema<string, string>;
    autoMigrate: Schema<boolean, boolean>;
    resume: Schema<boolean, boolean>;
    releaseBudget: Schema<number, number>;
    detailsTtlHours: Schema<number, number>;
    releaseTtlHours: Schema<number, number>;
    alertsWebhook: Schema<string, string>;
    schedule: Schema<string, string>;
    scheduleAlerts: Schema<boolean, boolean>;
    scheduleOnStart: Schema<boolean, boolean>;
}>, Schemastery.ObjectT<{
    enabled: Schema<boolean, boolean>;
    dataDir: Schema<string, string>;
    tokenEnv: Schema<string[], string[]>;
    topGrowth: Schema<number, number>;
    ecoVersion: Schema<string, string>;
    autoMigrate: Schema<boolean, boolean>;
    resume: Schema<boolean, boolean>;
    releaseBudget: Schema<number, number>;
    detailsTtlHours: Schema<number, number>;
    releaseTtlHours: Schema<number, number>;
    alertsWebhook: Schema<string, string>;
    schedule: Schema<string, string>;
    scheduleAlerts: Schema<boolean, boolean>;
    scheduleOnStart: Schema<boolean, boolean>;
}>>;
export declare function apply(ctx: Context, configInput: Config): void;
//# sourceMappingURL=plugin.d.ts.map