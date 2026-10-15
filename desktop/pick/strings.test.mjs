import "../shared/test-env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { LOCALES } from "../shared/i18n.mjs";
import { strings as pick, pickText } from "./strings.mjs";
import { strings as mini, miniText } from "../mini/strings.mjs";

for (const [name, table] of [
  ["pick", pick],
  ["mini", mini],
]) {
  test(`${name} strings cover all nine locales with the same keys`, () => {
    assert.deepEqual(Object.keys(table).sort(), [...LOCALES].sort());
    const keys = Object.keys(table.en).sort();
    for (const locale of LOCALES) {
      assert.deepEqual(Object.keys(table[locale]).sort(), keys, locale);
      for (const key of keys) assert.ok(table[locale][key].trim(), `${locale}.${key}`);
    }
  });
  test(`${name} strings never translate or drop placeholders`, () => {
    for (const locale of LOCALES)
      for (const [key, value] of Object.entries(table[locale])) {
        const vars = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
        assert.equal(vars(value), vars(table.en[key]), `${locale}.${key}`);
        if (/blink/i.test(table.en[key]))
          assert.match(value, /Blink/, `${locale}.${key} keeps Blink`);
      }
  });
}

test("the chips carry the spec's Chinese words", () => {
  assert.equal(miniText("zh-TW")("what"), "這是什麼");
  assert.equal(miniText("zh-TW")("translate"), "翻譯");
  assert.equal(miniText("zh-TW")("points"), "重點");
  assert.equal(miniText("zh-TW")("pauseAuto"), "暫停自動解說");
  assert.equal(pickText("zh-TW")("thisFrame"), "目前畫面");
  assert.equal(pickText("zh-TW")("translatePage"), "翻譯整頁");
});

test("an unknown language falls back to English", () => {
  assert.equal(miniText("it")("send"), "Send");
});
