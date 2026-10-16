import assert from "node:assert/strict";
import test from "node:test";
import { guidePrompt } from "../overlay/schema.mjs";
import { strings } from "../pick/strings.mjs";

const capture = { pixelWidth: 1280, pixelHeight: 800 };
const LIMITS =
  /concise|brief|short|at most|sentence|简短|簡短|簡單|간단|kurz|brevemente|brièvement|简洁|簡潔/i;

test("no chip prompt asks for a short answer, in any of the nine locales", () => {
  const locales = Object.keys(strings);
  assert.equal(locales.length, 9);
  for (const locale of locales)
    for (const [key, value] of Object.entries(strings[locale]))
      if (key.startsWith("prompt."))
        assert.doesNotMatch(value, LIMITS, `${locale} ${key}: ${value}`);
});

test("the guide prompt does not ask the model to be concise", () => {
  const prompt = guidePrompt(capture, "", "");
  assert.doesNotMatch(prompt, /concise|short answer|one short/i);
});
