import { beforeEach, describe, expect, it } from "vitest";
import { hasSensitiveContent } from "./privacy";
import { buildPageContext } from "./page-context";

describe("page privacy gate", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it.each([
    'type="password"',
    'type="PASSWORD"',
    'autocomplete="current-password"',
    'autocomplete="section-login new-password"',
  ])("blocks password metadata %s in nested shadow roots", (attribute) => {
    const host = document.createElement("div");
    document.body.append(host);
    const outer = host.attachShadow({ mode: "open" });
    outer.innerHTML = "<span></span>";
    outer.querySelector("span")!.attachShadow({ mode: "open" }).innerHTML =
      `<input ${attribute}>`;
    expect(hasSensitiveContent()).toBe(true);
    expect(buildPageContext().hasPassword).toBe(true);
  });

  it("inspects same origin frame documents and their shadow roots", () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const nested = frame.contentDocument!;
    Object.defineProperty(nested, "readyState", { value: "complete" });
    nested.body.innerHTML = "<div></div>";
    const shadow = nested.querySelector("div")!.attachShadow({ mode: "open" });
    shadow.innerHTML = '<input type="password">';
    expect(hasSensitiveContent()).toBe(true);
    shadow.querySelector("input")!.type = "text";
    expect(hasSensitiveContent()).toBe(false);
  });

  it.each(["opaque", "loading", "navigating", "throwing"])(
    "pauses when a frame is %s",
    (state) => {
      const frame = document.createElement("iframe");
      document.body.append(frame);
      const nested = frame.contentDocument!;
      if (state === "opaque")
        Object.defineProperty(frame, "contentDocument", { value: null });
      else if (state === "throwing")
        Object.defineProperty(frame, "contentDocument", {
          get: () => {
            throw new Error("cross origin");
          },
        });
      else {
        Object.defineProperty(nested, "readyState", {
          value: state === "loading" ? "loading" : "complete",
        });
        if (state === "navigating") frame.setAttribute("srcdoc", "<p>Next</p>");
      }
      expect(hasSensitiveContent()).toBe(true);
    },
  );

  it("is serializable without module dependencies and accepts public content", () => {
    document.body.innerHTML = '<p>Public article</p><input type="search">';
    const isolated = new Function(
      `return (${hasSensitiveContent.toString()})`,
    )() as typeof hasSensitiveContent;
    expect(isolated(document)).toBe(false);
    document.querySelector("input")!.autocomplete = "current-password";
    expect(isolated(document)).toBe(true);
  });

  it.each(["about:blank", " about:blank ", "ABOUT:blank"])(
    "accepts a loaded public blank frame with src %s",
    (source) => {
      const frame = document.createElement("iframe");
      frame.setAttribute("src", source);
      document.body.append(frame);
      Object.defineProperty(frame.contentDocument!, "readyState", {
        value: "complete",
      });
      expect(hasSensitiveContent()).toBe(false);
    },
  );

  for (const tag of ["object", "embed"]) {
    it(`pauses an inaccessible ${tag} document`, () => {
      document.body.innerHTML = `<${tag}></${tag}>`;
      expect(hasSensitiveContent()).toBe(true);
    });
    it(`checks an accessible ${tag} document`, () => {
      const nested = document.implementation.createHTMLDocument();
      Object.defineProperty(nested, "readyState", { value: "complete" });
      const element = document.createElement(tag);
      Object.defineProperty(element, "contentDocument", { value: nested });
      document.body.append(element);
      expect(hasSensitiveContent()).toBe(false);
      nested.body.innerHTML = '<input type="password">';
      expect(hasSensitiveContent()).toBe(true);
    });
  }

  it("fails closed when the inspection budget is exhausted", () => {
    document.body.innerHTML = "<span></span>".repeat(50_001);
    expect(hasSensitiveContent()).toBe(true);
  });
});
