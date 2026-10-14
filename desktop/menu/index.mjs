export const menuActions = Object.freeze(
  [
    ["screen", "截取畫面"],
    ["region", "選取區域"],
    ["full-page", "整頁截圖"],
    ["guide", "導覽"],
    ["auto-explain", "自動解說"],
    ["chat", "對話"],
    ["settings", "設定"],
    ["help", "說明"],
  ].map(([id, label]) => Object.freeze({ id, label })),
);
