export function launchDesktop(
  options?: Record<string, unknown>,
): Promise<{ version: string; alreadyRunning: boolean }>;
export function desktopEnabled(directory?: string): Promise<boolean>;
