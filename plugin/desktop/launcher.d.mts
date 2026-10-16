export function launchDesktop(
  options?: Record<string, unknown>,
): Promise<{ version: string; alreadyRunning: boolean }>;
export function desktopEnabled(directory?: string): Promise<boolean>;
export function startWithClaudeCode(userData: string): Promise<boolean>;
export function userDataDirectory(runtime?: string): string;
export function verifyInstalled(
  options?: Record<string, unknown>,
): Promise<boolean>;
