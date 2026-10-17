/** A draft left in the card holds Auto explain back only while keys are still
 * being pressed: a sentence nobody is writing any more must not keep it silent. */
export const DRAFT_IDLE_MS = 15000;
export const draftHolds = ({ typing, typingAt, now }) =>
  Boolean(typing) && now - typingAt < DRAFT_IDLE_MS;
