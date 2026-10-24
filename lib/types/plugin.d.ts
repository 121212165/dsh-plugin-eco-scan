/**
 * dsh wiring for eco-scan. One scan = fetch ecosystem surfaces → append a
 * dated snapshot → render segments + growth ranking from ALL history. The
 * agent-facing tool lets the harness answer "哪个插件赛道在涨" by itself.
 */
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { SnapshotStore } from './eco/snapshot.ts';
export declare const name = "eco-scan";
export declare const inject: string[];
export interface Config {
    enabled: boolean;
    dataDir?: string;
    tokenEnv: string[];
    topGrowth: number;
}
export declare const Config: Schema<Schemastery.ObjectS<{
    enabled: Schema<boolean, boolean>;
    dataDir: Schema<string, string>;
    tokenEnv: Schema<string[], string[]>;
    topGrowth: Schema<number, number>;
}>, Schemastery.ObjectT<{
    enabled: Schema<boolean, boolean>;
    dataDir: Schema<string, string>;
    tokenEnv: Schema<string[], string[]>;
    topGrowth: Schema<number, number>;
}>>;
export declare function runScan(store: SnapshotStore, token: string | undefined, topGrowth: number): Promise<string>;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=plugin.d.ts.map