import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { BlinkAvatar } from "./BlinkAvatar";
import {
  exportFloatingGeometry,
  readFloatingGeometry,
  rememberFloatingGeometry,
  restoreFloatingGeometry,
  type FloatingKind,
} from "./floatingWindow";
import { Timeline } from "./Timeline";
import {
  readSettings,
  type Backend,
  type Model,
  type Settings,
} from "./settings";
import { messages, type Locale } from "./locales";
import {
  changedPixels,
  imageSignature,
  processScreenImage,
  screenDimensions,
} from "./screen";
import { readAnswerStream } from "./answerStream";
import { safeMarkdown } from "./sanitize";
import "./style.css";

type Mode = "ask" | "passive" | "summary";
type Entry = {
  id: string;
  at: number;
  question: string;
  answer: string;
  kind: Mode;
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
};
type AnswerOutcome = {
  requestId: number;
  status: "streaming" | "complete" | "cancelled" | "incomplete";
  detail?: string;
} | null;
type PipHost = Window & {
  documentPictureInPicture?: {
    requestWindow(options: { width: number; height: number }): Promise<Window>;
  };
};
const actions = [0, 1, 2, 3, 4];
const locales: Locale[] = [
  "en",
  "zh-TW",
  "zh-CN",
  "ja",
  "ko",
  "es",
  "fr",
  "de",
  "pt-BR",
];
const languageNames: Record<Locale, string> = {
  en: "English",
  "zh-TW": "繁體中文",
  "zh-CN": "简体中文",
  ja: "日本語",
  ko: "한국어",
  es: "español",
  fr: "français",
  de: "Deutsch",
  "pt-BR": "português brasileiro",
};
function safeKeyTarget(target: EventTarget | null, win: Window): boolean {
  const ElementConstructor = (win as unknown as { Element: typeof Element })
    .Element;
  if (!(target instanceof ElementConstructor)) return false;
  const el = target as HTMLElement;
  return Boolean(
    el.closest(
      "input, textarea, select, option, [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']",
    ),
  );
}
function sourceLabel(surface: string | undefined, t: Record<string, string>) {
  if (surface === "monitor") return t.sourceMonitor;
  if (surface === "window") return t.sourceWindow;
  if (surface === "browser") return t.sourceBrowser;
  return "";
}
function App() {
  const demo =
    new URLSearchParams(location.search).has("demo") ||
    import.meta.env.BASE_URL === "/Glimpselet/";
  const [settings, setSettings] = useState(readSettings);
  const [token, setToken] = useState("");
  const [session, setSession] = useState("");
  const [sessionExpiresAt, setSessionExpiresAt] = useState(0);
  const [floatDoc, setFloatDoc] = useState<Document | null>(null);
  const [share, setShare] = useState<MediaStream | null>(null);
  const [liveFrame, setLiveFrame] = useState("");
  const [frozen, setFrozen] = useState(false);
  const [preview, setPreview] = useState("");
  const [sentPreview, setSentPreview] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerOutcome, setAnswerOutcomeState] = useState<AnswerOutcome>(null);
  const [pinnedAnswer, setPinnedAnswer] = useState("");
  const [history, setHistory] = useState<Entry[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [passive, setPassive] = useState(false);
  const [passivePaused, setPassivePaused] = useState(false);
  const [selectionMode, setSelectionMode] = useState<"crop" | "mask" | "">("");
  const [rect, setRect] = useState<[number, number, number, number] | null>(
    null,
  );
  const [masks, setMasks] = useState<Array<[number, number, number, number]>>(
    [],
  );
  const [drag, setDrag] = useState<[number, number, number, number] | null>(
    null,
  );
  const [key, setKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [popupFallback, setPopupFallback] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [copyState, setCopyState] = useState("");
  const [, setImageReady] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const passiveAbort = useRef<AbortController | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const shareRef = useRef<MediaStream | null>(null);
  const frameRef = useRef("");
  const imageRef = useRef<HTMLImageElement>(null);
  const demoFrame = useRef("");
  const generation = useRef(0);
  const answerOutcomeRef = useRef<AnswerOutcome>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const rectRef = useRef(rect);
  const masksRef = useRef(masks);
  rectRef.current = rect;
  masksRef.current = masks;
  const pauseInFlight = useRef<Promise<void> | null>(null);
  const cheerTimer = useRef<number | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const floatingButton = useRef<HTMLButtonElement>(null);
  const wasFloating = useRef(false);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const answerEnd = useRef<HTMLDivElement>(null);
  const followAnswer = useRef(true);
  const floatingKind = useRef<FloatingKind>("pip");
  const floatingSize = useRef(settings.size);
  const resizeStart = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  shareRef.current = share;
  frameRef.current = liveFrame;
  const t = messages[settings.locale];
  function setAnswerOutcome(value: AnswerOutcome) {
    answerOutcomeRef.current = value;
    setAnswerOutcomeState(value);
  }
  function markAnswerCancelled() {
    const current = answerOutcomeRef.current;
    if (
      current?.status === "streaming" &&
      current.requestId === generation.current
    )
      setAnswerOutcome({
        requestId: current.requestId,
        status: "cancelled",
        detail: t.answerCancelExplanation,
      });
  }
  function invalidateRequest() {
    markAnswerCancelled();
    generation.current++;
    activeRequest.current?.abort();
    activeRequest.current = null;
    abort.current = null;
    setBusy(false);
  }
  const actionLabels = [
    t.actionWhat,
    t.actionTranslate,
    t.actionSummarize,
    t.actionProblems,
    t.actionExplain,
  ];
  const hostWindow = floatDoc?.defaultView || window;
  useLayoutEffect(() => {
    if (floatDoc) {
      wasFloating.current = true;
      floatDoc
        .querySelector<HTMLElement>(".composer textarea, .welcome .primary")
        ?.focus({ preventScroll: true });
    } else if (wasFloating.current) {
      wasFloating.current = false;
      floatingButton.current?.focus({ preventScroll: true });
    }
  }, [floatDoc]);
  useEffect(() => {
    hostWindow.document.documentElement.lang = settings.locale;
  }, [settings.locale, hostWindow]);

  useEffect(() => {
    const dialog = settingsDialog.current;
    if (!showSettings || !dialog) return;
    dialog.showModal();
    return () => {
      dialog.close();
      settingsButton.current?.focus({ preventScroll: true });
    };
  }, [showSettings, floatDoc]);

  useLayoutEffect(() => {
    if (followAnswer.current && !showSettings && (answer || (busy && !passive)))
      answerEnd.current?.scrollIntoView({ block: "nearest" });
  }, [answer, busy, passive, showSettings, floatDoc]);

  useEffect(() => {
    try {
      sessionStorage.setItem("glimpselet-settings", JSON.stringify(settings));
    } catch {
      // The panel remains usable when browser storage is unavailable.
    }
  }, [settings]);
  useEffect(() => {
    if (video.current && share) {
      video.current.srcObject = share;
      void video.current.play().catch(() => {});
    }
  }, [share, floatDoc]);
  useEffect(() => {
    if (demo) {
      void fetch(`${import.meta.env.BASE_URL}assets/demo-fixture.svg`)
        .then((r) => r.text())
        .then((svg) => {
          const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
          demoFrame.current = url;
          setLiveFrame(url);
          setPreview(url);
          setFrozen(true);
          setStatus(t.statusDemoReady);
        });
      return;
    }
    const hash = location.hash.slice(1);
    if (hash) {
      window.history.replaceState(
        null,
        "",
        location.pathname + location.search,
      );
      setToken(hash);
    }
    const cached = (window as Window & { __glimpseletSession?: string })
      .__glimpseletSession;
    if (cached) setSession(cached);
    return () => {
      generation.current++;
      abort.current?.abort();
      passiveAbort.current?.abort();
      if (cheerTimer.current !== null) window.clearTimeout(cheerTimer.current);
    };
  }, [demo]);
  useEffect(() => {
    if (!token || session) return;
    void fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        const value = await r.json();
        if (!r.ok)
          throw new Error(
            value.code || value.message || value.error || "session_expired",
          );
        restoreFloatingGeometry(value.floatingGeometry);
        setSession(value.session);
        setSessionExpiresAt(value.expiresAt || Date.now() + 1_800_000);
        (
          window as Window & { __glimpseletSession?: string }
        ).__glimpseletSession = value.session;
        setToken("");
      })
      .catch((e) => setStatus(errorText(e)));
  }, [token, session]);
  useEffect(() => {
    if (demo || !session || !sessionExpiresAt) return;
    const timeout = window.setTimeout(
      () => {
        invalidateRequest();
        setStatus(errorText(new Error("session_expired")));
      },
      Math.max(0, sessionExpiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [demo, session, sessionExpiresAt]);
  useEffect(() => {
    if (!session || demo) return;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    let active = true;
    let retryTimer = 0;
    let retryDelay = 500;
    const connect = () => {
      if (!active) return;
      const channel = new WebSocket(
        `${protocol}//${location.host}/api/stream`,
        ["glimpselet", session],
      );
      socket.current = channel;
      channel.onopen = () => {
        retryDelay = 500;
        channel.send(
          JSON.stringify({ type: "share", active: Boolean(shareRef.current) }),
        );
      };
      channel.onmessage = (event) => {
        let m: { type?: string; id?: string };
        try {
          m = JSON.parse(event.data);
        } catch {
          return;
        }
        if (m.type === "clear") {
          resetLocal();
          setStatus(t.cleared);
          return;
        }
        if (m.type !== "capture-request" || !m.id) return;
        void (async () => {
          const captureGeneration = generation.current;
          try {
            const source = frozenRef.current
              ? frameRef.current
              : captureCurrent();
            const img =
              shareRef.current ||
              (frozenRef.current && source) ||
              (demo && source)
                ? await makeOutput(source)
                : "";
            if (channel.readyState === WebSocket.OPEN)
              channel.send(
                JSON.stringify(
                  captureGeneration === generation.current && img
                    ? { type: "capture", id: m.id, image: img }
                    : { type: "capture", id: m.id, error: "unavailable" },
                ),
              );
          } catch {
            if (channel.readyState === WebSocket.OPEN)
              channel.send(
                JSON.stringify({
                  type: "capture",
                  id: m.id,
                  error: "unavailable",
                }),
              );
          }
        })();
      };
      channel.onclose = () => {
        if (socket.current === channel) socket.current = null;
        if (active) {
          retryTimer = window.setTimeout(connect, retryDelay);
          retryDelay = Math.min(10_000, retryDelay * 2);
        }
      };
    };
    connect();
    return () => {
      active = false;
      window.clearTimeout(retryTimer);
      socket.current?.close();
      socket.current = null;
    };
  }, [session, demo]);
  useEffect(() => {
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(
        JSON.stringify({ type: "share", active: Boolean(share) }),
      );
  }, [share, session]);
  useEffect(() => {
    if (!share) return;
    const track = share.getVideoTracks()[0];
    const ended = () => {
      share.getTracks().forEach((item) => {
        if (item !== track) item.stop();
      });
      shareRef.current = null;
      setShare(null);
      setPassive(false);
      setPassivePaused(false);
      passiveAbort.current?.abort();
      abort.current?.abort();
      setFrozen(false);
      setLiveFrame("");
      setPreview("");
      setSentPreview(false);
      invalidateRequest();
      setStatus(t.statusScreenEnded);
    };
    track?.addEventListener("ended", ended, { once: true });
    return () => track?.removeEventListener("ended", ended);
  }, [share]);
  useEffect(() => {
    if (!share || frozen) return;
    const id = hostWindow.setInterval(() => {
      const next = captureCurrent(true);
      if (next) setLiveFrame(next);
    }, 500);
    return () => hostWindow.clearInterval(id);
  }, [share, frozen, floatDoc]);
  useEffect(() => {
    const image = imageRef.current;
    const container = stage.current;
    if (!image || !container) return;
    const observer = new ResizeObserver(() =>
      setImageReady((value) => value + 1),
    );
    observer.observe(image);
    observer.observe(container);
    return () => observer.disconnect();
  }, [liveFrame, floatDoc]);
  useEffect(() => {
    if (!liveFrame || !frozen || demo || selectionMode) return;
    let active = true;
    void makeOutput(liveFrame).then((output) => {
      if (active && output) {
        setPreview(output);
        setSentPreview(true);
      }
    });
    return () => {
      active = false;
    };
  }, [liveFrame, rect, masks, frozen, demo, selectionMode]);
  useEffect(() => {
    if (!floatDoc) return;
    const child = floatDoc.defaultView;
    if (!child) return;
    let pending = 0;
    const remember = () => rememberWindow(child);
    const resize = () => {
      child.clearTimeout(pending);
      pending = child.setTimeout(remember, 150);
    };
    const close = () => {
      child.clearTimeout(pending);
      remember();
      setFloatDoc(null);
      stopShare();
    };
    child.addEventListener("resize", resize);
    child.addEventListener("pagehide", close, { once: true });
    return () => {
      child.clearTimeout(pending);
      child.removeEventListener("resize", resize);
      child.removeEventListener("pagehide", close);
    };
  }, [floatDoc, session]);
  useEffect(() => {
    const windows = new Set([window, hostWindow]);
    const handlers = new Map<Window, (event: KeyboardEvent) => void>();
    windows.forEach((win) => {
      const keydown = (e: KeyboardEvent) => {
        if (showSettings || e.isComposing) return;
        if (e.key === "Escape" && !e.altKey && !e.ctrlKey && !e.metaKey) {
          if (selectionMode && !safeKeyTarget(e.target, win)) {
            setSelectionMode("");
            setDrag(null);
            return;
          }
          if (passive) void pausePassive();
          else if (activeRequest.current) cancelAnswer();
          else generation.current++;
          setSelectionMode("");
          setDrag(null);
          return;
        }
        if (
          e.altKey ||
          e.ctrlKey ||
          e.metaKey ||
          e.shiftKey ||
          safeKeyTarget(e.target, win) ||
          e.target !== stage.current
        )
          return;
        if (e.key.toLowerCase() === "s") startSelection("crop");
        if (e.key.toLowerCase() === "e") void ask(t.actionExplain);
        if (e.key.toLowerCase() === "t") void chooseAction(t.actionTranslate);
        if (e.key.toLowerCase() === "p") {
          if (passive) void pausePassive();
          else void resumePassive();
        }
      };
      handlers.set(win, keydown);
      win.addEventListener("keydown", keydown);
    });
    return () =>
      handlers.forEach((handler, win) =>
        win.removeEventListener("keydown", handler),
      );
  });
  useEffect(() => {
    if (!passive || !share || demo) return;
    let prior: number[] = [],
      busyLoop = false,
      sent: number[] = [],
      active = true;
    const timer = hostWindow.setInterval(async () => {
      if (busyLoop) return;
      busyLoop = true;
      const version = generation.current;
      try {
        const source = frozen ? frameRef.current : captureCurrent();
        const processed = await makeOutput(source);
        if (!active || version !== generation.current) return;
        if (!processed) return;
        const sig = await imageSignature(processed);
        if (!active || version !== generation.current) return;
        if (!prior.length) {
          prior = sig;
          return;
        }
        if (changedPixels(prior, sig) < 12) return;
        const now = Date.now();
        sent = sent.filter((at) => now - at < 60_000);
        if (sent.length >= settings.rateCap) return;
        sent.push(now);
        const controller = new AbortController();
        passiveAbort.current = controller;
        const succeeded = await askRequest(
          processed,
          t.passivePrompt,
          "passive",
          controller.signal,
        );
        if (succeeded) prior = sig;
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError"))
          setStatus(errorText(e));
      } finally {
        busyLoop = false;
      }
    }, 2000);
    return () => {
      active = false;
      hostWindow.clearInterval(timer);
      passiveAbort.current?.abort();
    };
  }, [
    passive,
    share,
    frozen,
    rect,
    masks,
    settings.rateCap,
    settings.backend,
    settings.model,
    key,
    session,
    demo,
    t,
  ]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setHistory((entries) => {
        const recent = entries.filter(
          (entry) => Date.now() - entry.at < 600_000,
        );
        return recent.length === entries.length ? entries : recent;
      });
    }, 10_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!demo && session) {
      const version = generation.current;
      void api("/api/history", {})
        .then((v) => {
          if (version === generation.current)
            setHistory(
              (v.entries || []).filter(
                (x: Entry) => Date.now() - x.at < 600_000,
              ),
            );
        })
        .catch((e) => setStatus(errorText(e)));
    }
  }, [session, demo]);

  function errorText(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "session_expired" || msg === "unauthorized") {
      setSession("");
      setSessionExpiresAt(0);
      resetLocal();
      delete (window as Window & { __glimpseletSession?: string })
        .__glimpseletSession;
      return t.reopen;
    }
    const codes: Record<string, string> = {
      session_expired: t.reopen,
      unauthorized: t.reopen,
      invalid_token: t.reopen,
      cli_missing: t.errorCliMissing,
      claude_missing: t.errorCliMissing,
      api_auth: t.errorApiAuth,
      api_key_missing: t.errorApiKeyMissing,
      answer_busy: t.errorBusy,
      provider_error: t.errorProvider,
      cli_error: t.errorProvider,
      provider_timeout: t.errorTimeout,
      answer_timeout: t.errorTimeout,
      empty_response: t.errorProtocol,
      incomplete_response: t.errorProtocol,
      provider_protocol: t.errorProtocol,
      invalid_image: t.errorImage,
      image_limit: t.errorImage,
      image_too_large: t.errorImage,
      request_too_large: t.errorImage,
      capture_unavailable: t.errorCapture,
      capture_timeout: t.errorCapture,
      NotAllowedError: t.errorCapture,
      NotReadableError: t.errorCapture,
      NotFoundError: t.errorCapture,
      answer_too_large: t.errorProtocol,
      response_limit: t.errorProtocol,
      answer_limit: t.errorProtocol,
      cancelled: t.errorCancelled,
      rate_limited: t.errorLimit,
      passive_limit: t.errorLimit,
      capture_limit: t.errorImage,
      request_limit: t.errorImage,
      capture_busy: t.errorBusy,
      unchanged_frame: t.statusLiveReady,
      notes_empty: t.errorNotesEmpty,
      question_limit: t.errorQuestion,
      session_limit: t.errorSessionLimit,
      invalid_request: t.error,
    };
    return (
      codes[msg] ||
      (e instanceof DOMException ? codes[e.name] : undefined) ||
      t.error
    );
  }
  async function api(path: string, data: unknown, signal?: AbortSignal) {
    if (!session) throw new Error("session_expired");
    const r = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session}`,
      },
      body: JSON.stringify(data),
      signal,
    });
    const value = await r.json();
    if (!r.ok)
      throw new Error(
        value.code || value.message || value.error || "request_failed",
      );
    return value;
  }
  function captureCurrent(previewOnly = false) {
    const videoElement = video.current;
    if (!videoElement?.videoWidth) return "";
    const c = document.createElement("canvas");
    const dimensions = previewOnly
      ? screenDimensions(videoElement.videoWidth, videoElement.videoHeight)
      : { width: videoElement.videoWidth, height: videoElement.videoHeight };
    c.width = dimensions.width;
    c.height = dimensions.height;
    c.getContext("2d")?.drawImage(videoElement, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  }
  async function startShare() {
    const requestGeneration = generation.current;
    try {
      const nav = hostWindow.navigator;
      const stream = await nav.mediaDevices.getDisplayMedia({
        video: { frameRate: 2 },
        audio: false,
      });
      if (requestGeneration !== generation.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      shareRef.current?.getTracks().forEach((track) => track.stop());
      shareRef.current = stream;
      setShare(stream);
      await new Promise((r) => setTimeout(r, 250));
      if (requestGeneration !== generation.current) return;
      const image = captureCurrent();
      setLiveFrame(image);
      setPreview(image);
      setFrozen(false);
      setSentPreview(false);
      setStatus(t.statusLiveReady);
    } catch (e) {
      if (requestGeneration === generation.current) setStatus(errorText(e));
    }
  }
  function stopShare() {
    invalidateRequest();
    shareRef.current?.getTracks().forEach((track) => track.stop());
    shareRef.current = null;
    setShare(null);
    setPassive(false);
    setPassivePaused(false);
    passiveAbort.current?.abort();
    abort.current?.abort();
  }
  async function pausePassive() {
    setPassive(false);
    setPassivePaused(true);
    setStatus(frozenRef.current ? t.frozen : t.statusLiveReady);
    invalidateRequest();
    const pausedGeneration = generation.current;
    passiveAbort.current?.abort();
    const pending =
      !demo && session
        ? api("/api/pause", {}).then(
            () => {},
            () => {},
          )
        : Promise.resolve();
    pauseInFlight.current = pending;
    await pending;
    if (pauseInFlight.current === pending) pauseInFlight.current = null;
    return pausedGeneration;
  }
  function cancelForProviderChange() {
    if (passive) void pausePassive();
    else {
      invalidateRequest();
      setStatus(shareRef.current ? t.statusLiveReady : t.notSharing);
    }
  }
  async function resumePassive() {
    const version = generation.current;
    if (pauseInFlight.current) await pauseInFlight.current;
    if (version !== generation.current || !shareRef.current) return;
    setPassivePaused(false);
    setPassive(true);
    setStatus(t.statusLiveReady);
  }
  function startSelection(mode: "crop" | "mask") {
    if (!share && !demo) return;
    if (!demo && !frozen) {
      const frame = captureCurrent();
      if (frame) {
        setLiveFrame(frame);
        setFrozen(true);
      }
    }
    setSentPreview(false);
    setSelectionMode(mode);
    setDrag(null);
    stage.current?.focus({ preventScroll: true });
  }
  async function makeOutput(source: string) {
    return processScreenImage(source, rectRef.current, masksRef.current);
  }
  function currentFrame() {
    return frozenRef.current ? frameRef.current : captureCurrent();
  }
  async function processedFrame() {
    return makeOutput(currentFrame());
  }
  async function askRequest(
    image: string | undefined,
    text: string,
    mode: Mode,
    signal?: AbortSignal,
  ) {
    if (activeRequest.current) {
      if (mode !== "passive") setStatus(t.errorBusy);
      return false;
    }
    const id = mode === "passive" ? generation.current : ++generation.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    if (mode === "ask" && image) {
      setPreview(image);
      setSentPreview(true);
    }
    if (signal?.aborted) controller.abort();
    else
      signal?.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    setBusy(true);
    if (mode !== "passive") {
      followAnswer.current = true;
      setCopyState("");
      setAnswer("");
      setAnswerOutcome({ requestId: id, status: "streaming" });
    }
    setStatus(mode === "passive" ? t.statusNoticing : t.statusThinking);
    abort.current = controller;
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session}`,
        },
        body: JSON.stringify({
          image,
          question: text,
          model: settings.model,
          mode,
          backend: settings.backend,
          ...(settings.backend === "api" ? { key } : {}),
          rateCap: settings.rateCap,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.code || err.message || "request_failed");
      }
      const { entry } = await readAnswerStream(
        response,
        (content) => {
          if (mode !== "passive" && id === generation.current)
            setAnswer(content);
        },
        () => {
          if (
            mode !== "passive" &&
            id === generation.current &&
            !controller.signal.aborted
          ) {
            setCelebrating(true);
            if (cheerTimer.current !== null)
              window.clearTimeout(cheerTimer.current);
            cheerTimer.current = window.setTimeout(
              () => setCelebrating(false),
              900,
            );
          }
        },
      );
      if (
        controller.signal.aborted ||
        id !== generation.current ||
        (mode !== "passive" && answerOutcomeRef.current?.requestId !== id)
      )
        return false;
      if (mode !== "passive")
        setAnswerOutcome({ requestId: id, status: "complete" });
      setHistory((h) =>
        [...h.filter((x) => Date.now() - x.at < 600_000), entry].slice(-100),
      );
      setStatus(
        mode === "passive" ? t.statusPassiveAdded : t.statusAnswerReady,
      );
      return true;
    } catch (e) {
      if (id === generation.current && !controller.signal.aborted) {
        const detail = errorText(e);
        if (
          mode !== "passive" &&
          id === generation.current &&
          answerOutcomeRef.current?.requestId === id
        ) {
          setAnswerOutcome({ requestId: id, status: "incomplete", detail });
        }
        setStatus(detail);
      }
      return false;
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        abort.current = null;
        setBusy(false);
      }
    }
  }
  async function ask(text = question) {
    if (!text.trim()) return;
    const requestGeneration = generation.current;
    let image = "";
    try {
      image = await processedFrame();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setStatus(errorText(e));
      return;
    }
    if (requestGeneration !== generation.current) return;
    if (!image) {
      setStatus(t.statusShareFirst);
      return;
    }
    if (passive) {
      const pausedGeneration = await pausePassive();
      if (pausedGeneration !== generation.current) return;
    } else if (pauseInFlight.current) {
      await pauseInFlight.current;
      if (requestGeneration !== generation.current) return;
    }
    if (demo) {
      setPreview(image);
      setSentPreview(true);
      const sample = t.demoAnswer;
      followAnswer.current = true;
      setCopyState("");
      setAnswer(sample);
      setAnswerOutcome({ requestId: ++generation.current, status: "complete" });
      setHistory((h) => [
        ...h,
        {
          id: String(Date.now()),
          at: Date.now(),
          question: text,
          answer: sample,
          kind: "ask",
        },
      ]);
      setStatus(t.statusFixtureAnswer);
      return;
    }
    await askRequest(image, text, "ask");
  }
  const clampPoint = (e: React.PointerEvent) => {
    const img = imageRef.current;
    if (!img) return [0, 0] as const;
    const ir = img.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - ir.left) / ir.width)),
      Math.max(0, Math.min(1, (e.clientY - ir.top) / ir.height)),
    ] as const;
  };
  function pointerDown(e: React.PointerEvent) {
    if (!selectionMode || !stage.current) return;
    e.preventDefault();
    setSentPreview(false);
    const [x, y] = clampPoint(e);
    setDrag([x, y, x, y]);
    stage.current.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const [x, y] = clampPoint(e);
    setDrag([drag[0], drag[1], x, y]);
  }
  function pointerUp(e: React.PointerEvent) {
    if (!drag) return;
    const [x, y] = clampPoint(e);
    const l = Math.min(x, drag[0]),
      top = Math.min(y, drag[1]),
      w = Math.abs(x - drag[0]),
      h = Math.abs(y - drag[1]);
    if (
      w * (imageRef.current?.naturalWidth || 1) >= 8 &&
      h * (imageRef.current?.naturalHeight || 1) >= 8
    ) {
      const box: [number, number, number, number] = [l, top, w, h];
      if (selectionMode === "mask") setMasks((v) => [...v, box]);
      else setRect(box);
    }
    setDrag(null);
    setSelectionMode("");
  }
  function selectionKey(e: React.KeyboardEvent) {
    if (
      !selectionMode ||
      e.altKey ||
      e.ctrlKey ||
      e.metaKey ||
      e.nativeEvent.isComposing
    )
      return;
    if (
      e.key !== "Enter" &&
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    const box: [number, number, number, number] = drag
      ? [
          Math.min(drag[0], drag[2]),
          Math.min(drag[1], drag[3]),
          Math.max(drag[0], drag[2]),
          Math.max(drag[1], drag[3]),
        ]
      : [0.25, 0.25, 0.75, 0.75];
    if (e.key === "Enter") {
      const selected: [number, number, number, number] = [
        box[0],
        box[1],
        box[2] - box[0],
        box[3] - box[1],
      ];
      if (
        selected[2] * (imageRef.current?.naturalWidth || 1) >= 8 &&
        selected[3] * (imageRef.current?.naturalHeight || 1) >= 8
      ) {
        if (selectionMode === "mask")
          setMasks((previous) => [...previous, selected]);
        else setRect(selected);
      }
      setDrag(null);
      setSelectionMode("");
      return;
    }
    const axis = e.key === "ArrowLeft" || e.key === "ArrowRight" ? 0 : 1;
    const delta = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -0.02 : 0.02;
    if (e.shiftKey) {
      const pixels =
        axis === 0
          ? imageRef.current?.naturalWidth
          : imageRef.current?.naturalHeight;
      const minimum = Math.min(1, 8 / (pixels || 1));
      box[axis + 2] = Math.max(
        box[axis] + minimum,
        Math.min(1, box[axis + 2]! + delta),
      );
    } else {
      const move = Math.max(-box[axis], Math.min(1 - box[axis + 2]!, delta));
      box[axis] += move;
      box[axis + 2]! += move;
    }
    setDrag(box);
  }
  async function openFloat(usePopup = false) {
    try {
      const pip = usePopup
        ? undefined
        : (window as PipHost).documentPictureInPicture;
      floatingKind.current = pip ? "pip" : "popup";
      floatingSize.current = settings.size;
      const geometry = readFloatingGeometry(
        settings.size,
        floatingKind.current,
        screenBounds(window),
      );
      const child = pip
        ? await pip.requestWindow({
            width: geometry.width,
            height: geometry.height,
          })
        : window.open(
            "",
            "glimpselet",
            `popup,width=${geometry.width},height=${geometry.height}${geometry.left === undefined ? "" : `,left=${geometry.left},top=${geometry.top}`}`,
          );
      if (!child) {
        setStatus(t.statusPopupBlocked);
        return;
      }
      child.document.body.replaceChildren();
      child.document.head
        .querySelectorAll('link[rel="stylesheet"], style')
        .forEach((sheet) => sheet.remove());
      child.document.title = "Glimpselet";
      child.document.documentElement.lang = settings.locale;
      setPopupFallback(false);
      child.document.body.className = settings.theme;
      document.head
        .querySelectorAll<
          HTMLLinkElement | HTMLStyleElement
        >('link[rel="stylesheet"], style')
        .forEach((sheet) => {
          child.document.head.append(sheet.cloneNode(true));
        });
      setFloatDoc(child.document);
      if (!pip) setStatus(t.popupNote);
    } catch (e) {
      if (!usePopup) {
        setPopupFallback(true);
        setStatus(t.popupFallbackHelp);
      } else setStatus(errorText(e));
    }
  }
  function screenBounds(win: Window) {
    const screen = win.screen as Screen & {
      availLeft?: number;
      availTop?: number;
    };
    return {
      left: screen.availLeft ?? 0,
      top: screen.availTop ?? 0,
      width: screen.availWidth,
      height: screen.availHeight,
    };
  }
  function rememberWindow(child: Window) {
    rememberFloatingGeometry(floatingSize.current, floatingKind.current, {
      innerWidth: child.innerWidth,
      innerHeight: child.innerHeight,
      outerWidth: child.outerWidth,
      outerHeight: child.outerHeight,
      left: child.screenX,
      top: child.screenY,
    });
    if (!demo && session)
      void api("/api/floating-geometry", {
        geometry: exportFloatingGeometry(),
      }).catch(() => {});
  }
  function resizeWindow(width: number, height: number) {
    const child = floatDoc?.defaultView;
    if (!child) return;
    try {
      child.resizeTo(
        Math.max(320, width) + Math.max(0, child.outerWidth - child.innerWidth),
        Math.max(360, height) +
          Math.max(0, child.outerHeight - child.innerHeight),
      );
    } catch {
      setStatus(t.resizeHelp);
    }
  }
  function toggleSize() {
    const size = settings.size === "compact" ? "expanded" : "compact";
    const child = floatDoc?.defaultView;
    if (child) {
      rememberWindow(child);
      const geometry = readFloatingGeometry(
        size,
        floatingKind.current,
        screenBounds(child),
      );
      floatingSize.current = size;
      resizeWindow(geometry.width, geometry.height);
    }
    setSettings((s) => ({ ...s, size }));
  }
  const chooseAction = (label: string) => {
    const prompt =
      label === t.actionTranslate
        ? t.translatePrompt.replace(
            "{language}",
            languageNames[settings.locale],
          )
        : label;
    setQuestion(prompt);
    void ask(prompt);
  };
  async function copy(text: string) {
    try {
      await hostWindow.navigator.clipboard.writeText(text);
      setCopyState(t.copied);
    } catch {
      setCopyState(t.copyError);
    }
  }
  function cancelAnswer() {
    if (passive) {
      void pausePassive();
      return;
    }
    invalidateRequest();
    setStatus(t.statusAnswerCancelled);
  }
  function exportNotes() {
    const rows = history
      .filter((h) => Date.now() - h.at < 600_000)
      .map(
        (h) =>
          `## ${new Date(h.at).toLocaleTimeString()} · ${h.kind}\n\n**${h.question}**\n\n${h.answer}`,
      )
      .join("\n\n---\n\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows], { type: "text/markdown" }));
    a.download = "glimpselet-notes.md";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function resetLocal() {
    stopShare();
    const frame = demo ? demoFrame.current : "";
    frameRef.current = frame;
    setLiveFrame(frame);
    setPreview(frame);
    setFrozen(demo);
    setSentPreview(false);
    setRect(null);
    setMasks([]);
    setSelectionMode("");
    setDrag(null);
    setQuestion("");
    setAnswer("");
    setAnswerOutcome(null);
    setPinnedAnswer("");
    setHistory([]);
    setKey("");
    setCopyState("");
  }
  async function clearHistory() {
    resetLocal();
    if (demo) {
      setStatus(t.cleared);
      return;
    }
    try {
      await api("/api/clear", {});
      setStatus(t.cleared);
    } catch (e) {
      setStatus(errorText(e));
    }
  }
  async function summary() {
    if (
      !history.some(
        (entry) => entry.kind === "passive" && Date.now() - entry.at < 600_000,
      )
    ) {
      setStatus(t.errorNotesEmpty);
      return;
    }
    const version = passive ? await pausePassive() : generation.current;
    if (version !== generation.current) return;
    await askRequest(undefined, t.summaryPrompt, "summary");
  }
  const mainPanel = (
    <main
      className={`app ${settings.theme} ${settings.size}`}
      onScroll={(e) => {
        const end = answerEnd.current?.getBoundingClientRect();
        if (end)
          followAnswer.current =
            end.bottom <= e.currentTarget.getBoundingClientRect().bottom + 48;
      }}
    >
      <style>{`@font-face{font-family:Fraunces;src:url('${import.meta.env.BASE_URL}assets/Fraunces.ttf') format('truetype');font-display:swap}@font-face{font-family:Inter;src:url('${import.meta.env.BASE_URL}assets/Inter.ttf') format('truetype');font-display:swap}`}</style>
      <header>
        <BlinkAvatar
          label={t.blinkAlt}
          mood={
            busy
              ? "think"
              : passivePaused
                ? "paused"
                : selectionMode
                  ? "selecting"
                  : celebrating
                    ? "done"
                    : "idle"
          }
        />
        <div className="brand">
          <strong>Glimpselet</strong>
          <small>{t.tagline}</small>
        </div>
        <div className="header-actions">
          <button
            title={settings.size === "compact" ? t.expand : t.compact}
            aria-label={settings.size === "compact" ? t.expand : t.compact}
            onClick={toggleSize}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path
                d={
                  settings.size === "compact" ? "M4 10h12M10 4v12" : "M4 10h12"
                }
              />
            </svg>
          </button>
          <button
            ref={settingsButton}
            title={t.settings}
            aria-label={t.settings}
            aria-haspopup="dialog"
            onClick={() => setShowSettings((v) => !v)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M8 2h4l.6 2.1 1.7 1 2.1-.5 2 3.5-1.5 1.6v2l1.5 1.6-2 3.5-2.1-.5-1.7 1L12 18H8l-.6-2.1-1.7-1-2.1.5-2-3.5L3 10.3v-2L1.5 6.7l2-3.5 2.1.5 1.7-1L8 2Z" />
              <circle cx="10" cy="9.3" r="2.4" />
            </svg>
          </button>
        </div>
      </header>
      <button
        ref={floatingButton}
        className="float-primary primary"
        onClick={() =>
          floatDoc
            ? (floatDoc.defaultView?.focus(), setStatus(t.returnPanel))
            : void openFloat()
        }
      >
        {floatDoc ? t.returnOpener : t.floating}
      </button>
      <div className="status">
        <span className="status-source">
          <span
            className={`dot ${share || demo ? "live" : ""}`}
            aria-hidden="true"
          />
          {demo
            ? t.demo
            : share
              ? `${t.sharing}${share.getVideoTracks()[0] ? ` · ${sourceLabel(share.getVideoTracks()[0]!.getSettings().displaySurface, t) || t.sourceWindow}` : ""}`
              : t.notSharing}
          {(share || demo || (frozen && liveFrame)) && (
            <>
              {" "}
              · {rect ? t.scopeArea : t.scopeFull} ·{" "}
              {frozen ? t.scopeFrozen : sentPreview ? t.scopeSent : t.scopeLive}
              {masks.length > 0 &&
                ` · ${t.maskCount.replace("{count}", String(masks.length))}`}
            </>
          )}
        </span>
        <span className="status-details">
          {settings.model} · {settings.backend.toUpperCase()} ·{" "}
          {passive
            ? t.passiveOn
            : passivePaused
              ? t.passivePaused
              : t.passiveOff}
        </span>
      </div>
      <div className="body">
        {!(share || demo || (frozen && liveFrame)) ? (
          <section className="welcome">
            <p className="eyebrow">{t.eyebrow}</p>
            <h1>{t.welcome}</h1>
            <p>{t.intro}</p>
            <button className="primary" onClick={() => void startShare()}>
              {t.shareScreen}
            </button>
            <button
              className="text-button"
              onClick={() => setStatus(t.popupNote)}
            >
              {t.floatingInfo}
            </button>
          </section>
        ) : (
          <>
            <div className="tools">
              {!demo && share && !frozen && sentPreview && (
                <button
                  onClick={() => {
                    setSentPreview(false);
                    if (!busy) setStatus(t.statusLiveReady);
                  }}
                >
                  {t.resumePreview}
                </button>
              )}
              {!demo && share && (
                <button
                  onClick={() => {
                    const f = captureCurrent(frozen);
                    setLiveFrame(f);
                    setPreview(f);
                    setFrozen(!frozen);
                    setSentPreview(false);
                    setSelectionMode("");
                    setDrag(null);
                    setStatus(frozen ? t.statusLiveReady : t.frozen);
                  }}
                >
                  {frozen ? t.resumeLive : t.freeze}
                </button>
              )}
              <button
                onClick={() => {
                  setRect(null);
                  setMasks([]);
                  setSelectionMode("");
                  setSentPreview(false);
                  if (shareRef.current) {
                    const f = captureCurrent();
                    setLiveFrame(f);
                    setFrozen(false);
                  }
                }}
              >
                {t.reset}
              </button>
              <button
                disabled={!share && !demo}
                onClick={() => {
                  setSentPreview(false);
                  startSelection("crop");
                }}
              >
                {t.select} <kbd>S</kbd>
              </button>
              <button
                disabled={!share && !demo}
                onClick={() => {
                  setSentPreview(false);
                  startSelection("mask");
                }}
              >
                {t.redact}
              </button>
              <button
                disabled={!share}
                className={passive ? "active" : ""}
                aria-pressed={passive}
                onClick={() => {
                  if (passive) void pausePassive();
                  else void resumePassive();
                }}
              >
                {passive ? t.pause : t.passive} <kbd>P</kbd>
              </button>
              {!demo && <button onClick={stopShare}>{t.stop}</button>}
            </div>
            <div
              ref={stage}
              aria-keyshortcuts="S E T P"
              className={`stage ${selectionMode ? "drawing" : ""}`}
              tabIndex={0}
              role="group"
              aria-label={t.previewAlt}
              aria-describedby={
                selectionMode ? "selection-instructions" : undefined
              }
              onKeyDown={selectionKey}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={pointerUp}
              onPointerCancel={() => {
                setDrag(null);
                setSelectionMode("");
              }}
            >
              {!demo && <video ref={video} muted playsInline />}
              {(liveFrame || preview) && (
                <img
                  ref={imageRef}
                  draggable={false}
                  onLoad={() => setImageReady((n) => n + 1)}
                  className="frame"
                  src={sentPreview && preview ? preview : liveFrame || preview}
                  alt={demo ? t.demoAlt : t.previewAlt}
                />
              )}
              {!sentPreview &&
                imageRef.current &&
                (() => {
                  const sr = stage.current?.getBoundingClientRect(),
                    ir = imageRef.current?.getBoundingClientRect();
                  if (!sr || !ir) return null;
                  const overlay = {
                    left: ir.left - sr.left,
                    top: ir.top - sr.top,
                    width: ir.width,
                    height: ir.height,
                  };
                  return (
                    <div className="image-overlay" style={overlay}>
                      {rect && (
                        <div
                          className="selection"
                          style={{
                            left: `${rect[0] * 100}%`,
                            top: `${rect[1] * 100}%`,
                            width: `${rect[2] * 100}%`,
                            height: `${rect[3] * 100}%`,
                          }}
                        />
                      )}
                      {masks.map((m, i) => (
                        <div
                          key={i}
                          className="mask"
                          style={{
                            left: `${m[0] * 100}%`,
                            top: `${m[1] * 100}%`,
                            width: `${m[2] * 100}%`,
                            height: `${m[3] * 100}%`,
                          }}
                        />
                      ))}
                      {drag && (
                        <div
                          className={
                            selectionMode === "mask" ? "mask" : "selection"
                          }
                          style={{
                            left: `${Math.min(drag[0], drag[2]) * 100}%`,
                            top: `${Math.min(drag[1], drag[3]) * 100}%`,
                            width: `${Math.abs(drag[2] - drag[0]) * 100}%`,
                            height: `${Math.abs(drag[3] - drag[1]) * 100}%`,
                          }}
                        />
                      )}
                    </div>
                  );
                })()}
              {selectionMode && (
                <span
                  id="selection-instructions"
                  className="hint"
                  role="status"
                >
                  {t.dragHint}
                </span>
              )}
            </div>
            <div className="chips">
              {actions.map((index) => (
                <button
                  key={index}
                  onClick={() => chooseAction(actionLabels[index]!)}
                >
                  {actionLabels[index]}
                </button>
              ))}
            </div>
            <div className="composer">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={t.question}
                aria-label={t.question}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    (e.ctrlKey || e.metaKey) &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    if (!busy) void ask();
                  }
                }}
                rows={2}
              />
              <button
                className="primary"
                disabled={busy}
                onClick={() => void ask()}
              >
                {busy ? t.thinking : t.send}
              </button>
            </div>
          </>
        )}
        {busy && (
          <button
            className="text-button"
            aria-keyshortcuts="Escape"
            onClick={cancelAnswer}
          >
            {passive ? t.pausePassive : t.cancel}
          </button>
        )}
        {pinnedAnswer &&
          !(
            answerOutcome?.status === "complete" && pinnedAnswer === answer
          ) && (
            <article className="answer pinned">
              <div className="answer-top">
                <BlinkAvatar mood="idle" label={t.blinkAlt} />
                <span>{t.pinned}</span>
                <button onClick={() => void copy(pinnedAnswer)}>
                  {t.copy}
                </button>
                <button onClick={() => setPinnedAnswer("")}>{t.unpin}</button>
              </div>
              <div
                className="markdown"
                role="region"
                aria-label={t.pinned}
                tabIndex={0}
                dangerouslySetInnerHTML={{
                  __html: safeMarkdown(pinnedAnswer),
                }}
              />
            </article>
          )}
        {(answer || answerOutcome) && (
          <article
            className={`answer ${answerOutcome?.status === "complete" && answer && pinnedAnswer === answer ? "pinned" : ""}`}
            aria-busy={answerOutcome?.status === "streaming"}
          >
            <div className="answer-top">
              <BlinkAvatar
                label={t.blinkAlt}
                mood={
                  answerOutcome?.status === "streaming"
                    ? "think"
                    : answerOutcome?.status === "complete" && celebrating
                      ? "done"
                      : "idle"
                }
              />
              <span>
                {answerOutcome?.status === "streaming"
                  ? t.answerStateStreaming
                  : answerOutcome?.status === "complete"
                    ? pinnedAnswer === answer && answer
                      ? t.pinned
                      : t.answerStateComplete
                    : answerOutcome?.status === "cancelled"
                      ? t.answerStateCancelled
                      : answerOutcome?.status === "incomplete"
                        ? t.answerStateIncomplete
                        : t.answer}
              </span>
              {answerOutcome?.status === "streaming" && (
                <span className="thinking-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              )}
              <button disabled={!answer} onClick={() => void copy(answer)}>
                {t.copy}
              </button>
              <button
                disabled={
                  answerOutcome?.status !== "complete" || !answer.trim()
                }
                aria-pressed={Boolean(
                  answerOutcome?.status === "complete" &&
                    answer &&
                    pinnedAnswer === answer,
                )}
                onClick={() => {
                  setPinnedAnswer((value) => (value === answer ? "" : answer));
                }}
              >
                {answerOutcome?.status === "complete" &&
                answer &&
                pinnedAnswer === answer
                  ? t.unpin
                  : t.pin}
              </button>
            </div>
            {answer ? (
              <div
                className="markdown"
                role="region"
                aria-label={t.answer}
                tabIndex={0}
                dangerouslySetInnerHTML={{ __html: safeMarkdown(answer) }}
              />
            ) : answerOutcome?.status === "streaming" ? (
              <p className="answer-empty">{t.answerWaiting}</p>
            ) : null}
            {answerOutcome?.status === "cancelled" && (
              <p className="answer-state-detail">{answerOutcome.detail}</p>
            )}
            {answerOutcome?.status === "incomplete" && (
              <p className="answer-state-detail">{answerOutcome.detail}</p>
            )}
            <div ref={answerEnd} className="answer-end" />
          </article>
        )}
        {(share || demo || history.length > 0) && (
          <Timeline
            entries={history}
            locale={settings.locale}
            title={t.timeline}
            summary={t.summary}
            exportLabel={t.export}
            onSummary={() => void summary()}
            onExport={exportNotes}
          />
        )}
        <p className="notice" role="status">
          {status}
        </p>
        <p className="copy-feedback" role="status">
          {copyState}
        </p>
        {showSettings && (
          <dialog
            ref={settingsDialog}
            className="settings"
            aria-labelledby="settings-title"
            onCancel={() => setShowSettings(false)}
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              const controls = e.currentTarget.querySelectorAll<HTMLElement>(
                "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
              );
              const first = controls[0];
              const last = controls[controls.length - 1];
              const active = e.currentTarget.ownerDocument.activeElement;
              if (e.shiftKey && active === first) {
                e.preventDefault();
                last?.focus();
              } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first?.focus();
              }
            }}
          >
            <h2 id="settings-title">{t.settings}</h2>
            <label>
              {t.language}
              <select
                aria-label={t.language}
                value={settings.locale}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    locale: e.target.value as Locale,
                  }))
                }
              >
                {locales.map((l, i) => (
                  <option value={l} key={l}>
                    {
                      [
                        "English",
                        "繁體中文",
                        "简体中文",
                        "日本語",
                        "한국어",
                        "Español",
                        "Français",
                        "Deutsch",
                        "Português (Brasil)",
                      ][i]
                    }
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.theme}
              <select
                aria-label={t.theme}
                value={settings.theme}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    theme: e.target.value as Settings["theme"],
                  }))
                }
              >
                <option value="light">{t.light}</option>
                <option value="dark">{t.dark}</option>
              </select>
            </label>
            <label>
              {t.model}
              <select
                aria-label={t.model}
                value={settings.model}
                onChange={(e) => {
                  cancelForProviderChange();
                  setSettings((s) => ({
                    ...s,
                    model: e.target.value as Model,
                  }));
                }}
              >
                <option value="sonnet">Sonnet</option>
                <option value="opus">Opus</option>
                <option value="haiku">Haiku</option>
              </select>
            </label>
            <label>
              {t.backend}
              <select
                aria-label={t.backend}
                value={settings.backend}
                onChange={(e) => {
                  cancelForProviderChange();
                  setSettings((s) => ({
                    ...s,
                    backend: e.target.value as Backend,
                  }));
                }}
              >
                <option value="cli">CLI</option>
                <option value="api">API</option>
              </select>
            </label>
            {settings.backend === "api" && (
              <label>
                {t.key}
                <input
                  aria-label={t.key}
                  type="password"
                  value={key}
                  onChange={(e) => {
                    cancelForProviderChange();
                    setKey(e.target.value);
                  }}
                  autoComplete="off"
                  placeholder={t.memoryOnly}
                />
              </label>
            )}
            <label>
              {t.rateCap}
              <select
                aria-label={t.rateCap}
                value={settings.rateCap}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    rateCap: Math.max(1, Math.min(6, Number(e.target.value))),
                  }))
                }
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <p>{t.costNote}</p>
            <p>{t.privacyNote}</p>
            <div className="settings-actions">
              <button onClick={() => void clearHistory()}>{t.clear}</button>
              <button onClick={() => setShowSettings(false)}>{t.done}</button>
            </div>
          </dialog>
        )}
      </div>
      <footer>
        <span>{demo ? t.demo : t.localCapture}</span>
        {floatDoc && (
          <button
            className="resize-handle"
            aria-label={t.resizePanel}
            title={t.resizeHelp}
            onPointerDown={(e) => {
              const child = floatDoc.defaultView;
              if (!child) return;
              resizeStart.current = {
                x: e.screenX,
                y: e.screenY,
                width: child.innerWidth,
                height: child.innerHeight,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const start = resizeStart.current;
              if (start)
                resizeWindow(
                  start.width + e.screenX - start.x,
                  start.height + e.screenY - start.y,
                );
            }}
            onPointerUp={() => {
              resizeStart.current = null;
            }}
            onPointerCancel={() => {
              resizeStart.current = null;
            }}
            onLostPointerCapture={() => {
              resizeStart.current = null;
            }}
            onKeyDown={(e) => {
              const child = floatDoc.defaultView;
              if (
                !child ||
                !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  e.key,
                )
              )
                return;
              e.preventDefault();
              resizeWindow(
                child.innerWidth +
                  (e.key === "ArrowRight"
                    ? 24
                    : e.key === "ArrowLeft"
                      ? -24
                      : 0),
                child.innerHeight +
                  (e.key === "ArrowDown" ? 24 : e.key === "ArrowUp" ? -24 : 0),
              );
            }}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 12 8-8m-3 8 3-3" />
            </svg>
          </button>
        )}
        {popupFallback && (
          <button onClick={() => void openFloat(true)}>
            {t.popupFallbackAction}
          </button>
        )}
      </footer>
    </main>
  );
  if (floatDoc)
    return (
      <>
        <main className={`opener-card ${settings.theme}`}>
          <BlinkAvatar label={t.blinkAlt} />
          <h1>{t.openerTitle}</h1>
          <p>{t.returnOpener}</p>
          <button
            className="primary"
            onClick={() => {
              floatDoc.defaultView?.focus();
              setStatus(t.returnPanel);
            }}
          >
            {t.returnPanel}
          </button>
          <button
            onClick={() => {
              floatDoc.defaultView?.close();
              setFloatDoc(null);
              stopShare();
            }}
          >
            {t.closePanel}
          </button>
        </main>
        {createPortal(mainPanel, floatDoc.body)}
      </>
    );
  return mainPanel;
}
createRoot(document.getElementById("root")!).render(<App />);
