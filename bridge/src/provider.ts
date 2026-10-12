import { runCliProvider } from "./provider-cli.js";
import { runApiProvider } from "./provider-api.js";
import type { AnswerProvider } from "./provider-request.js";

export type {
  AnswerProvider,
  ProviderRequest,
  ProviderResult,
} from "./provider-request.js";
export const runProvider: AnswerProvider = (request) =>
  request.backend === "api" ? runApiProvider(request) : runCliProvider(request);
