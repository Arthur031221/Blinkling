export class PanelError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "PanelError";
  }
}

export const cancelled = () =>
  new PanelError("cancelled", "The request was cancelled.", 409);
