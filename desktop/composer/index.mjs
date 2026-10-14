export function createComposer() {
  const attachments = new Map();
  return {
    attach: (attachment) =>
      attachments.set(attachment.id, structuredClone(attachment)),
    remove: (id) => attachments.delete(id),
    turn: (id, text) => ({
      id,
      text,
      attachments: structuredClone([...attachments.values()]),
      source: "composer",
    }),
    clear: () => attachments.clear(),
  };
}
