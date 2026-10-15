import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasSensitiveContent } from "./privacy";

describe("page privacy gate", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("V21-08 distinguishes passwords from inaccessible embedded content for recovery", () => {
    document.body.innerHTML = '<input type="password">';
    expect(hasSensitiveContent(document, false, true)).toBe("password");
    document.body.innerHTML = "<p>Public product</p><iframe></iframe>";
    Object.defineProperty(
      document.querySelector("iframe")!,
      "contentDocument",
      { value: null },
    );
    expect(hasSensitiveContent(document, false, true)).toBe("uninspectable");
    expect(hasSensitiveContent(document, true, true)).toBeUndefined();
    expect(hasSensitiveContent()).toBe(true);
  });

  it("reports a known password even when an inaccessible embed appears first", () => {
    document.body.innerHTML = '<iframe></iframe><input type="password">';
    Object.defineProperty(
      document.querySelector("iframe")!,
      "contentDocument",
      { value: null },
    );
    expect(hasSensitiveContent(document, false, true)).toBe("password");
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

  it("manual text can exclude unreadable embeds without relaxing the default", () => {
    document.body.innerHTML = "<p>Japanese article</p><iframe></iframe>";
    const frame = document.querySelector("iframe")!;
    Object.defineProperty(frame, "contentDocument", { value: null });
    expect(hasSensitiveContent(document, true)).toBe(false);
    expect(hasSensitiveContent()).toBe(true);
    document.body.insertAdjacentHTML("beforeend", '<input type="password">');
    expect(hasSensitiveContent(document, true)).toBe(true);
  });

  it("manual text still blocks passwords in accessible frames and shadow roots", () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const nested = frame.contentDocument!;
    Object.defineProperty(nested, "readyState", { value: "complete" });
    nested.body.innerHTML = '<input type="password">';
    expect(hasSensitiveContent(document, true)).toBe(true);
    nested.body.innerHTML = "";
    const host = document.createElement("div");
    document.body.append(host);
    host.attachShadow({ mode: "open" }).innerHTML = '<input type="password">';
    expect(hasSensitiveContent(document, true)).toBe(true);
  });

  it("manual text inspects accessible frames while their resources are loading", () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const nested = frame.contentDocument!;
    Object.defineProperty(nested, "readyState", { value: "loading" });
    nested.body.innerHTML = '<input type="password">';
    expect(hasSensitiveContent(document, true)).toBe(true);
    nested.body.innerHTML = "<p>Public article</p>";
    expect(hasSensitiveContent(document, true)).toBe(false);
    expect(hasSensitiveContent()).toBe(true);
  });

  it.each(["hidden", "offscreen", "zero-area"])(
    "explicit visible capture excludes only a proven %s opaque tracking frame",
    (state) => {
      document.body.innerHTML =
        "<p>Public product: 500 ml, ¥2,200</p><iframe></iframe>";
      const frame = document.querySelector("iframe")!;
      Object.defineProperty(frame, "contentDocument", { value: null });
      if (state === "hidden") frame.style.display = "none";
      else
        vi.spyOn(frame, "getClientRects").mockReturnValue([
          state === "offscreen"
            ? new DOMRect(0, window.innerHeight + 50, 4, 4)
            : new DOMRect(0, 0, 0, 0),
        ] as unknown as DOMRectList);
      expect(hasSensitiveContent(document, "visible-capture")).toBe(false);
      // The default gate still protects passive reads and full-page pixels.
      expect(hasSensitiveContent()).toBe(true);
    },
  );

  it.each(["visible", "unmeasured", "aria-hidden", "almost-transparent"])(
    "explicit visible capture keeps a %s opaque frame blocked",
    (state) => {
      document.body.innerHTML = "<p>Public product</p><iframe></iframe>";
      const frame = document.querySelector("iframe")!;
      Object.defineProperty(frame, "contentDocument", { value: null });
      if (state !== "unmeasured")
        vi.spyOn(frame, "getClientRects").mockReturnValue([
          new DOMRect(0, 0, 4, 4),
        ] as unknown as DOMRectList);
      if (state === "aria-hidden") frame.setAttribute("aria-hidden", "true");
      if (state === "almost-transparent") frame.style.opacity = "0.01";
      expect(hasSensitiveContent(document, "visible-capture")).toBe(true);
      expect(hasSensitiveContent(document, true)).toBe(false);
    },
  );

  it("rechecks frame paint after layout changes and inspects hidden accessible passwords", () => {
    document.body.innerHTML = "<div style='opacity:0'><iframe></iframe></div>";
    const frame = document.querySelector("iframe")!;
    Object.defineProperty(frame, "contentDocument", {
      value: null,
      configurable: true,
    });
    vi.spyOn(frame, "getClientRects").mockReturnValue([
      new DOMRect(0, 0, 300, 150),
    ] as unknown as DOMRectList);
    expect(hasSensitiveContent(document, "visible-capture")).toBe(false);
    document.querySelector("div")!.style.opacity = "1";
    expect(hasSensitiveContent(document, "visible-capture")).toBe(true);
    const nested = document.implementation.createHTMLDocument();
    Object.defineProperty(nested, "readyState", { value: "complete" });
    nested.body.innerHTML = '<input type="password" hidden>';
    Object.defineProperty(frame, "contentDocument", { value: nested });
    frame.style.display = "none";
    expect(hasSensitiveContent(document, "visible-capture")).toBe(true);
  });

  it("serializes the scoped visible-capture gate without module dependencies", () => {
    document.body.innerHTML = "<iframe style='display:none'></iframe>";
    const frame = document.querySelector("iframe")!;
    Object.defineProperty(frame, "contentDocument", { value: null });
    const isolated = new Function(
      `return (${hasSensitiveContent.toString()})`,
    )() as typeof hasSensitiveContent;
    expect(isolated(document, "visible-capture")).toBe(false);
    frame.style.display = "block";
    expect(isolated(document, "visible-capture")).toBe(true);
    document.body.insertAdjacentHTML(
      "beforeend",
      '<input type="password" hidden>',
    );
    expect(isolated(document, true)).toBe(true);
  });

  it("does not use object visibility as proof when its fallback can override it", () => {
    document.body.innerHTML =
      '<object style="visibility:hidden"><p style="visibility:visible">UNKNOWN_EMBED_FALLBACK</p></object>';
    expect(hasSensitiveContent(document, "visible-capture")).toBe(true);
  });

  it("does not infer offscreen safety when a CSS filter can expand painted content", () => {
    document.body.innerHTML =
      '<div style="filter:blur(20px)"><iframe></iframe></div>';
    const frame = document.querySelector("iframe")!;
    Object.defineProperty(frame, "contentDocument", { value: null });
    vi.spyOn(frame, "getClientRects").mockReturnValue([
      new DOMRect(-10, 0, 4, 4),
    ] as unknown as DOMRectList);
    expect(hasSensitiveContent(document, "visible-capture")).toBe(true);
  });
});
