"use client";

import { forwardRef, useCallback, useEffect, useMemo, useRef } from "react";

import { cn } from "@/lib/utils";

const JS_KEYWORDS = new Set([
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "default",
  "new",
  "delete",
  "typeof",
  "instanceof",
  "in",
  "of",
  "try",
  "catch",
  "finally",
  "throw",
  "void",
  "this",
  "null",
  "undefined",
  "true",
  "false",
  "async",
  "await",
  "yield",
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Lightweight single-pass tokenizer. Highlights comments, strings, numbers,
// keywords and identifiers. Intentionally simple — good enough for short
// sandbox snippets, not a full JS parser.
function highlight(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;

  const wrap = (cls: string, text: string) => `<span class="${cls}">${escapeHtml(text)}</span>`;

  while (i < n) {
    const ch = source[i];

    // Line comment
    if (ch === "/" && source[i + 1] === "/") {
      let j = i + 2;
      while (j < n && source[j] !== "\n") j += 1;
      out += wrap("tok-comment", source.slice(i, j));
      i = j;
      continue;
    }

    // Block comment
    if (ch === "/" && source[i + 1] === "*") {
      let j = i + 2;
      while (j < n && !(source[j] === "*" && source[j + 1] === "/")) j += 1;
      j = Math.min(n, j + 2);
      out += wrap("tok-comment", source.slice(i, j));
      i = j;
      continue;
    }

    // Strings (", ', `)
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === quote) {
          j += 1;
          break;
        }
        if (quote !== "`" && source[j] === "\n") break;
        j += 1;
      }
      out += wrap("tok-string", source.slice(i, j));
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[0-9._a-fxA-FXeE+-]/.test(source[j])) j += 1;
      out += wrap("tok-number", source.slice(i, j));
      i = j;
      continue;
    }

    // Identifiers / keywords
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(source[j])) j += 1;
      const word = source.slice(i, j);
      if (JS_KEYWORDS.has(word)) {
        out += wrap("tok-keyword", word);
      } else if (source[j] === "(") {
        out += wrap("tok-fn", word);
      } else {
        out += escapeHtml(word);
      }
      i = j;
      continue;
    }

    out += escapeHtml(ch);
    i += 1;
  }

  return out;
}

export type JsCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  spellCheck?: boolean;
  ariaLabel?: string;
};

export const JsCodeEditor = forwardRef<HTMLTextAreaElement, JsCodeEditorProps>(function JsCodeEditor(
  { value, onChange, className, spellCheck = false, ariaLabel },
  forwardedRef,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);

  const setRefs = useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef],
  );

  const highlighted = useMemo(() => {
    // Trailing newline keeps the final line height in the overlay aligned.
    const html = highlight(value);
    return value.endsWith("\n") ? `${html}\n` : html;
  }, [value]);

  const syncScroll = useCallback(() => {
    const textarea = innerRef.current;
    const pre = preRef.current;
    if (!textarea || !pre) return;
    pre.scrollTop = textarea.scrollTop;
    pre.scrollLeft = textarea.scrollLeft;
  }, []);

  useEffect(() => {
    syncScroll();
  }, [value, syncScroll]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      const textarea = event.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const next = `${value.slice(0, start)}  ${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + 2;
        textarea.setSelectionRange(cursor, cursor);
      });
    },
    [onChange, value],
  );

  return (
    <div className={cn("relative overflow-hidden rounded-md border bg-background font-mono text-sm", className)}>
      <pre
        ref={preRef}
        aria-hidden="true"
        className="js-code-highlight pointer-events-none m-0 h-full w-full overflow-auto whitespace-pre-wrap break-words px-3 py-2"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
      <textarea
        ref={setRefs}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={syncScroll}
        onKeyDown={handleKeyDown}
        spellCheck={spellCheck}
        aria-label={ariaLabel}
        style={{ tabSize: 2, lineHeight: 1.5 }}
        className="absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre-wrap break-words bg-transparent px-3 py-2 text-transparent caret-foreground outline-none"
      />
    </div>
  );
});
