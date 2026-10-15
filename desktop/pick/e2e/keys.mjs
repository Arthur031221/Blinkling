/** Native keys through XTest: what a person at the keyboard produces, seen by
 * the global key hook and by whichever window X gives the keyboard to. */
import { execFileSync } from "node:child_process";

const script = (name, down) => `import ctypes
x=ctypes.CDLL('libX11.so.6');t=ctypes.CDLL('libXtst.so.6');x.XOpenDisplay.restype=ctypes.c_void_p;d=x.XOpenDisplay(None)
assert d
x.XFlush.argtypes=[ctypes.c_void_p];x.XCloseDisplay.argtypes=[ctypes.c_void_p]
x.XStringToKeysym.argtypes=[ctypes.c_char_p];x.XStringToKeysym.restype=ctypes.c_ulong
x.XKeysymToKeycode.argtypes=[ctypes.c_void_p,ctypes.c_ulong];x.XKeysymToKeycode.restype=ctypes.c_ubyte
t.XTestFakeKeyEvent.argtypes=[ctypes.c_void_p,ctypes.c_uint,ctypes.c_int,ctypes.c_ulong]
try:
 k=x.XKeysymToKeycode(d,x.XStringToKeysym(b'${name}'))
 t.XTestFakeKeyEvent(d,k,${down ? 1 : 0},0);x.XFlush(d)
finally:x.XCloseDisplay(d)`;

const run = (name, down) => execFileSync("python3", ["-c", script(name, down)]);
export const keyDown = (name) => run(name, true);
export const keyUp = (name) => run(name, false);
export const tap = (name) => (keyDown(name), keyUp(name));
export const CTRL = "Control_L";
export const SHIFT = "Shift_L";
