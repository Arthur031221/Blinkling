// Blinkling key tap for macOS: a separate process that listens to the global
// keyboard, mouse buttons and wheel and prints one short line per event.
//
// It exists because an in-process hook can block Electron's main thread: the
// old hook resolved every key through the main queue, and an input method such
// as Zhuyin that held the main thread then deadlocked with it. Here the tap
// runs on this process's own run loop, never looks a key up, and writes with
// write(2) on a non-blocking pipe, so a slow or dead parent costs events and
// never time.
//
// With --buttons it creates no tap: it reads the state of the mouse buttons,
// which macOS answers without any permission, and prints "md 0" on each press.
// That keeps a click away from Blinkling noticed while Input Monitoring and
// Accessibility are still off.
//
// Lines on stdout: "ready listen|active|buttons", "denied", "kd|ku <code>",
// "md 0", "wh 0". Codes are the uiohook scancodes the pick gate already uses.
// Build: clang -O2 -arch arm64 -arch x86_64 -framework ApplicationServices
//        -framework CoreFoundation keytap.c -o blinkling-keytap

#include <ApplicationServices/ApplicationServices.h>
#include <CoreFoundation/CoreFoundation.h>
#include <dispatch/dispatch.h>
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

typedef struct {
  int vk;       // macOS virtual key code
  int code;     // uiohook scancode
  uint64_t bit; // device dependent flag bit that is set while it is held
  uint64_t any; // generic flag mask of the modifier
} Modifier;

// Device dependent bits are the NX_DEVICE*KEYMASK values; the generic masks
// are the public kCGEventFlagMask* values.
static const Modifier MODIFIERS[] = {
    {59, 29, 0x00000001ULL, kCGEventFlagMaskControl},
    {62, 3613, 0x00002000ULL, kCGEventFlagMaskControl},
    {56, 42, 0x00000002ULL, kCGEventFlagMaskShift},
    {60, 54, 0x00000004ULL, kCGEventFlagMaskShift},
    {58, 56, 0x00000020ULL, kCGEventFlagMaskAlternate},
    {61, 3640, 0x00000040ULL, kCGEventFlagMaskAlternate},
};
#define MODIFIER_COUNT (sizeof(MODIFIERS) / sizeof(MODIFIERS[0]))

static int held[MODIFIER_COUNT];
static CFMachPortRef tap = NULL;
static uint64_t last_wheel = 0;

// Escape is 1, a modifier maps to its scancode, any other key is offset so it
// can never be mistaken for the pick key.
static int map_code(int vk) {
  if (vk == 53) return 1;
  for (size_t i = 0; i < MODIFIER_COUNT; i++)
    if (MODIFIERS[i].vk == vk) return MODIFIERS[i].code;
  return 1000 + vk;
}

// One write per line. A full pipe drops the event instead of waiting.
static void emit(const char *kind, int code) {
  char line[32];
  int n = snprintf(line, sizeof line, "%s %d\n", kind, code);
  if (n <= 0) return;
  ssize_t w = write(STDOUT_FILENO, line, (size_t)n);
  (void)w;
}

static void emit_word(const char *word) {
  size_t n = strlen(word);
  ssize_t w = write(STDOUT_FILENO, word, n);
  (void)w;
}

// A key-up swallowed while the tap was off (secure input, a timeout) would
// leave a modifier looking held forever, so ask the system what is down now.
static void release_stale(void) {
  CGEventFlags now =
      CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState);
  for (size_t i = 0; i < MODIFIER_COUNT; i++) {
    if (held[i] && !(now & MODIFIERS[i].any)) {
      held[i] = 0;
      emit("ku", MODIFIERS[i].code);
    }
  }
}

static CGEventRef on_event(CGEventTapProxy proxy, CGEventType type,
                           CGEventRef event, void *info) {
  (void)proxy;
  (void)info;
  switch (type) {
  case kCGEventTapDisabledByTimeout:
  case kCGEventTapDisabledByUserInput:
    if (tap) CGEventTapEnable(tap, true);
    release_stale();
    break;
  case kCGEventFlagsChanged: {
    int vk = (int)CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
    uint64_t flags = (uint64_t)CGEventGetFlags(event);
    for (size_t i = 0; i < MODIFIER_COUNT; i++) {
      if (MODIFIERS[i].vk != vk) continue;
      int down = (flags & MODIFIERS[i].bit) != 0;
      if (down != held[i]) {
        held[i] = down;
        emit(down ? "kd" : "ku", MODIFIERS[i].code);
      }
      break;
    }
    break;
  }
  case kCGEventKeyDown:
    // Auto repeat is not a new press.
    if (!CGEventGetIntegerValueField(event, kCGKeyboardEventAutorepeat))
      emit("kd", map_code((int)CGEventGetIntegerValueField(
                     event, kCGKeyboardEventKeycode)));
    break;
  case kCGEventKeyUp:
    emit("ku", map_code((int)CGEventGetIntegerValueField(
                   event, kCGKeyboardEventKeycode)));
    break;
  case kCGEventLeftMouseDown:
  case kCGEventRightMouseDown:
  case kCGEventOtherMouseDown:
    emit("md", 0);
    break;
  case kCGEventScrollWheel: {
    // A trackpad floods the wheel; the gate only needs the first tick.
    uint64_t t = CGEventGetTimestamp(event);
    if (t - last_wheel > 50000000ULL) {
      last_wheel = t;
      emit("wh", 0);
    }
    break;
  }
  default:
    break;
  }
  return event;
}

static int selftest(void) {
  int ok = map_code(53) == 1 && map_code(59) == 29 && map_code(62) == 3613 &&
           map_code(58) == 56 && map_code(61) == 3640 && map_code(56) == 42 &&
           map_code(60) == 54 && map_code(0) == 1000;
  puts(ok ? "selftest ok" : "selftest failed");
  return ok ? 0 : 1;
}

// The parent closing our stdin, or dying, ends us.
static void watch_parent(void) {
  dispatch_source_t watch = dispatch_source_create(
      DISPATCH_SOURCE_TYPE_READ, STDIN_FILENO, 0,
      dispatch_get_global_queue(QOS_CLASS_UTILITY, 0));
  dispatch_source_set_event_handler(watch, ^{
    char buffer[64];
    ssize_t n = read(STDIN_FILENO, buffer, sizeof buffer);
    if (n == 0 || (n < 0 && errno != EAGAIN && errno != EINTR)) _exit(0);
  });
  dispatch_resume(watch);
}

// Presses seen by reading the buttons every 10 ms. No event tap, no permission.
static int buttons_only(void) {
  watch_parent();
  static int was_down = 0;
  dispatch_source_t timer = dispatch_source_create(
      DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
  dispatch_source_set_timer(timer, DISPATCH_TIME_NOW, 10 * NSEC_PER_MSEC,
                            2 * NSEC_PER_MSEC);
  dispatch_source_set_event_handler(timer, ^{
    int down =
        CGEventSourceButtonState(kCGEventSourceStateCombinedSessionState,
                                 kCGMouseButtonLeft) ||
        CGEventSourceButtonState(kCGEventSourceStateCombinedSessionState,
                                 kCGMouseButtonRight);
    if (down && !was_down) emit("md", 0);
    was_down = down;
  });
  dispatch_resume(timer);
  emit_word("ready buttons\n");
  dispatch_main();
  return 0;
}

int main(int argc, char **argv) {
  if (argc > 1 && strcmp(argv[1], "--selftest") == 0) return selftest();
  if (argc > 1 && strcmp(argv[1], "--buttons") == 0) {
    int flags = fcntl(STDOUT_FILENO, F_GETFL, 0);
    if (flags >= 0) fcntl(STDOUT_FILENO, F_SETFL, flags | O_NONBLOCK);
    return buttons_only();
  }
  if (argc > 1 && strcmp(argv[1], "--version") == 0) {
    puts("blinkling-keytap 1");
    return 0;
  }
  int flags = fcntl(STDOUT_FILENO, F_GETFL, 0);
  if (flags >= 0) fcntl(STDOUT_FILENO, F_SETFL, flags | O_NONBLOCK);

  CGEventMask mask =
      CGEventMaskBit(kCGEventKeyDown) | CGEventMaskBit(kCGEventKeyUp) |
      CGEventMaskBit(kCGEventFlagsChanged) |
      CGEventMaskBit(kCGEventLeftMouseDown) |
      CGEventMaskBit(kCGEventRightMouseDown) |
      CGEventMaskBit(kCGEventOtherMouseDown) |
      CGEventMaskBit(kCGEventScrollWheel);
  const char *mode = "listen";
  tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap,
                         kCGEventTapOptionListenOnly, mask, on_event, NULL);
  if (!tap) {
    // Accessibility alone allows the default tap, which the callback below
    // only ever answers with the event unchanged.
    mode = "active";
    tap = CGEventTapCreate(kCGSessionEventTap, kCGHeadInsertEventTap,
                           kCGEventTapOptionDefault, mask, on_event, NULL);
  }
  if (!tap) {
    emit_word("denied\n");
    return 3;
  }

  watch_parent();

  CFRunLoopSourceRef source =
      CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0);
  CFRunLoopAddSource(CFRunLoopGetCurrent(), source, kCFRunLoopCommonModes);
  CGEventTapEnable(tap, true);
  char ready[32];
  snprintf(ready, sizeof ready, "ready %s\n", mode);
  emit_word(ready);
  CFRunLoopRun();
  return 0;
}
