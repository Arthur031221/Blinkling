export function adoptLegacyEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export function legacyLocations(options?: {
  home?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}): [from: string, to: string, kind: string][];
export function migrateLegacyData(options?: {
  home?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  skipped?: "explicit" | "done";
  moved: { from: string; to: string }[];
  failed: { from: string; error: string }[];
}>;
export function migrationRecord(home?: string): Promise<{
  at: string;
  moved: { from: string; to: string }[];
} | null>;
