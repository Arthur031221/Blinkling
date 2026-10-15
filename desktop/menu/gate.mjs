/** Whether the fan may be open this frame. It needs a rested pointer on a
 * revealed Blink, and it stays shut while the mini composer or the
 * conversation card is open: those are where the user is working (NS-3). */
export const fanWanted = ({ ready, stay, chatOpen, miniOpen }) =>
  Boolean(ready && stay && !chatOpen && !miniOpen);
