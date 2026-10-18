/*
 * blinkling-run.exe: a stub for Windows processes that start a command
 * without a shell. Claude Code spawns MCP servers that way, and a bare
 * .cmd file cannot be spawned that way. This program runs the
 * blinkling-run.cmd file next to it through cmd.exe, hands over the
 * remaining command line unchanged, shares stdin, stdout and stderr, and
 * exits with the same code.
 */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wchar.h>

static const wchar_t *skip_program(const wchar_t *line) {
  if (*line == L'"') {
    line++;
    while (*line && *line != L'"') line++;
    if (*line == L'"') line++;
  } else {
    while (*line && *line != L' ' && *line != L'\t') line++;
  }
  while (*line == L' ' || *line == L'\t') line++;
  return line;
}

int wmain(void) {
  wchar_t self[MAX_PATH * 2];
  DWORD n = GetModuleFileNameW(NULL, self, (DWORD)(sizeof(self) / sizeof(self[0])));
  if (n == 0 || n >= sizeof(self) / sizeof(self[0])) return 1;

  size_t len = wcslen(self);
  if (len < 4 || _wcsicmp(self + len - 4, L".exe") != 0) return 1;
  wcscpy(self + len - 4, L".cmd");

  const wchar_t *rest = skip_program(GetCommandLineW());
  size_t need = wcslen(self) + wcslen(rest) + 32;
  wchar_t *cmdline = (wchar_t *)HeapAlloc(GetProcessHeap(), 0, need * sizeof(wchar_t));
  if (!cmdline) return 1;
  /* cmd /s strips the outer pair of quotes and keeps the inner ones. */
  wcscpy(cmdline, L"cmd.exe /d /s /c \"\"");
  wcscat(cmdline, self);
  wcscat(cmdline, L"\" ");
  wcscat(cmdline, rest);
  wcscat(cmdline, L"\"");

  STARTUPINFOW si;
  PROCESS_INFORMATION pi;
  ZeroMemory(&si, sizeof(si));
  si.cb = sizeof(si);
  ZeroMemory(&pi, sizeof(pi));
  if (!CreateProcessW(NULL, cmdline, NULL, NULL, TRUE, 0, NULL, NULL, &si, &pi)) return 1;

  WaitForSingleObject(pi.hProcess, INFINITE);
  DWORD code = 1;
  GetExitCodeProcess(pi.hProcess, &code);
  CloseHandle(pi.hProcess);
  CloseHandle(pi.hThread);
  return (int)code;
}
