export function createMessageStream() {
  const messages = [];
  return {
    append: (message) => messages.push(structuredClone(message)),
    snapshot: () => structuredClone(messages),
  };
}
