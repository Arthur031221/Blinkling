"""Holds a global grab on Control+Alt+Shift+B until it is killed, so a second
program that asks for the same key is refused (the acceptance test for a quit key
the system will not give)."""
import sys, time
from Xlib import X, display
d = display.Display()
root = d.screen().root
code = d.keysym_to_keycode(ord("b"))
mods = X.ControlMask | X.Mod1Mask | X.ShiftMask
for extra in (0, X.LockMask, X.Mod2Mask, X.LockMask | X.Mod2Mask):
    root.grab_key(code, mods | extra, True, X.GrabModeAsync, X.GrabModeAsync)
d.sync()
print("held", flush=True)
while True:
    time.sleep(1)
