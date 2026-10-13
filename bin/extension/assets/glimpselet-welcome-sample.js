(() => {
  const allowed = new Set([
    "float",
    "capture",
    "suggest",
    "passive",
    "guide",
    "translate",
    "selection",
    "pdf",
  ]);
  const labels = {
    en: {
      float: "Float the bubble, then switch windows.",
      capture: "Capture this page and ask what changes the taste.",
      suggest: "Choose one of the suggested questions in the bubble.",
      passive: "Turn on passive mode, then change pages.",
      guide: "Start Guide and follow its pointers to the tea buttons.",
      translate: "Translate this page in place, then restore the original.",
      selection: "Select a sentence and choose Explain, Translate, or Ask.",
      pdf: "Open the sample PDF in the Glimpselet reader.",
    },
    "zh-TW": {
      float: "開啟浮動視窗，再切換到其他視窗。",
      capture: "擷取此頁面，詢問哪些因素會改變茶的風味。",
      suggest: "在浮動視窗中選擇一個建議問題。",
      passive: "開啟被動模式，再切換頁面。",
      guide: "啟動導覽，跟著指引找到茶葉按鈕。",
      translate: "在頁面上翻譯內容，再切回原文。",
      selection: "選取一句文字，選擇解釋、翻譯或提問。",
      pdf: "在 Glimpselet 閱讀器開啟 PDF 範例。",
    },
  };
  let locale = "en";
  function applyLocale(value) {
    if (value !== "en" && value !== "zh-TW") return;
    locale = value;
    document.documentElement.lang = locale;
    const practiceLabel = document.querySelector("[data-practice-label]");
    if (practiceLabel)
      practiceLabel.textContent =
        locale === "zh-TW" ? "Glimpselet 練習頁面" : "Glimpselet practice page";
  }
  applyLocale(new URLSearchParams(location.search).get("locale") || "en");
  let readyRequestId;
  let contentReady = false;
  function acknowledgeLoaded() {
    if (!contentReady || !readyRequestId || !window.opener) return;
    window.opener.postMessage(
      {
        type: "glimpselet:tutorial:loaded",
        version: 1,
        requestId: readyRequestId,
      },
      location.origin,
    );
  }
  const delivered = new Set();
  window.addEventListener("message", (event) => {
    if (
      event.source === window &&
      event.origin === location.origin &&
      event.data?.type === "glimpselet:tutorial:content-ready" &&
      event.data.version === 1
    ) {
      contentReady = true;
      acknowledgeLoaded();
      return;
    }
    if (event.source !== window.opener || event.origin !== location.origin)
      return;
    const request = event.data;
    if (
      request?.version !== 1 ||
      typeof request.requestId !== "string" ||
      !request.requestId ||
      request.requestId.length > 128
    )
      return;
    if (request.type === "glimpselet:tutorial:probe") {
      applyLocale(request.locale);
      readyRequestId = request.requestId;
      acknowledgeLoaded();
      return;
    }
    if (
      request?.type !== "glimpselet:tutorial-action" ||
      !contentReady ||
      request.requestId !== readyRequestId ||
      delivered.has(request.requestId) ||
      !allowed.has(request.action) ||
      !Number.isInteger(request.step) ||
      request.step < 1 ||
      request.step > 8 ||
      [...allowed][request.step - 1] !== request.action
    )
      return;
    delivered.add(request.requestId);
    applyLocale(request.locale);
    const banner = document.querySelector("#tour-request");
    const heading = document.createElement("strong");
    heading.textContent =
      locale === "zh-TW"
        ? "導覽步驟 " + request.step + "："
        : "Tour step " + request.step + ":";
    banner.replaceChildren(heading);
    if (locale === "en") banner.append(document.createTextNode(" "));
    banner.append(document.createTextNode(labels[locale][request.action]));
    banner.classList.add("visible");
    window.dispatchEvent(
      new CustomEvent("glimpselet:tutorial-action", {
        detail: {
          type: "glimpselet:tutorial-action",
          version: 1,
          action: request.action,
          step: request.step,
          locale,
          code: typeof request.code === "string" ? request.code : null,
        },
      }),
    );
    if (window.opener) {
      window.opener.postMessage(
        {
          type: "glimpselet:tutorial:ready",
          version: 1,
          requestId: request.requestId,
          action: request.action,
          step: request.step,
        },
        location.origin,
      );
    }
  });
})();
