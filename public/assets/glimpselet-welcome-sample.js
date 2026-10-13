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
    float: "Float the bubble, then switch windows.",
    capture: "Capture this page and ask what changes the taste.",
    suggest: "Choose one of the suggested questions in the bubble.",
    passive: "Turn on passive mode, then change pages.",
    guide: "Start Guide and follow its pointers to the tea buttons.",
    translate: "Translate this page in place, then restore the original.",
    selection: "Select a sentence and choose Explain, Translate, or Ask.",
    pdf: "Open the sample PDF in the Glimpselet reader.",
  };
  window.addEventListener("message", (event) => {
    if (event.source !== window.opener || event.origin !== location.origin)
      return;
    const request = event.data;
    if (
      request?.type !== "glimpselet:tutorial-action" ||
      request.version !== 1 ||
      !allowed.has(request.action) ||
      !Number.isInteger(request.step) ||
      request.step < 1 ||
      request.step > 8
    )
      return;
    const banner = document.querySelector("#tour-request");
    banner.innerHTML = "<strong>Tour step " + request.step + ":</strong> ";
    banner.append(document.createTextNode(labels[request.action]));
    banner.classList.add("visible");
    window.dispatchEvent(
      new CustomEvent("glimpselet:tutorial-action", {
        detail: {
          type: "glimpselet:tutorial-action",
          version: 1,
          action: request.action,
          step: request.step,
          code: typeof request.code === "string" ? request.code : null,
        },
      }),
    );
    if (window.opener) {
      window.opener.postMessage(
        {
          type: "glimpselet:tutorial:ready",
          version: 1,
          action: request.action,
          step: request.step,
        },
        location.origin,
      );
    }
  });
})();
