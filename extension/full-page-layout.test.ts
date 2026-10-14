import { afterEach, expect, it, vi } from "vitest";
import { fullPageLayout } from "./full-page-layout";
afterEach(() => {
  fullPageLayout("end", "test");
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
it("keeps fixed headers on the first frame, unpins sticky sections, then restores exact styles", () => {
  document.body.innerHTML =
    '<header style="position:fixed;top:0;color:red!important">Header</header><nav style="position:sticky;top:20px">Section</nav><main>Content</main>';
  const header = document.querySelector("header")!,
    nav = document.querySelector("nav")!;
  const initial = [header.getAttribute("style"), nav.getAttribute("style")];
  fullPageLayout("begin", "test");
  expect(header.style.visibility).toBe("");
  expect(nav.style.position).toBe("relative");
  fullPageLayout("next", "test");
  expect(header.style.visibility).toBe("hidden");
  fullPageLayout("end", "other");
  expect(header.style.visibility).toBe("hidden");
  fullPageLayout("end", "test");
  expect([header.getAttribute("style"), nav.getAttribute("style")]).toEqual(
    initial,
  );
});
it("does not let concurrent captures erase another capture's restoration state", () => {
  fullPageLayout("begin", "test");
  expect(() => fullPageLayout("begin", "other")).toThrow("capture_busy");
});
