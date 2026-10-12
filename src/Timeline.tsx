import { safeMarkdown } from "./sanitize";
import type { Locale } from "./locales";

type Note = {
  id: string;
  at: number;
  question: string;
  answer: string;
  kind: string;
};
export function Timeline({
  entries,
  locale,
  title,
  summary,
  exportLabel,
  onSummary,
  onExport,
}: {
  entries: Note[];
  locale: Locale;
  title: string;
  summary: string;
  exportLabel: string;
  onSummary: () => void;
  onExport: () => void;
}) {
  const recent = entries
    .filter((entry) => Date.now() - entry.at < 600_000)
    .slice(-20)
    .reverse();
  return (
    <details className="timeline">
      <summary>
        {title} · {recent.length}
      </summary>
      {recent.map((entry) => (
        <article key={entry.id}>
          <time>{new Date(entry.at).toLocaleTimeString(locale)}</time>
          <strong>{entry.question}</strong>
          <div
            className="markdown"
            role="region"
            aria-label={entry.question}
            tabIndex={0}
            dangerouslySetInnerHTML={{ __html: safeMarkdown(entry.answer) }}
          />
        </article>
      ))}
      <div className="timeline-actions">
        <button onClick={onSummary}>{summary}</button>
        <button onClick={onExport}>{exportLabel}</button>
      </div>
    </details>
  );
}
