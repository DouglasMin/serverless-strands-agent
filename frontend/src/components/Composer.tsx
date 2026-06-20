import { useEffect, useRef, useState } from "react";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function Composer({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.style.height = "auto";
        ref.current.focus();
      }
    });
  };

  // Auto-resize textarea on text change.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [text]);

  return (
    <div className="composer">
      <div className="composer__shell">
        <span className="composer__prefix mono" aria-hidden>
          ›
        </span>
        <textarea
          ref={ref}
          className="composer__input"
          value={text}
          placeholder="ask anything…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          disabled={disabled}
          spellCheck
        />
        <button
          className="composer__send"
          onClick={submit}
          disabled={disabled || !text.trim()}
          aria-label="send message"
        >
          <span aria-hidden>{disabled ? "…" : "↵"}</span>
        </button>
      </div>
      <div className="composer__hint mono">
        <kbd>enter</kbd> to send · <kbd>shift</kbd> + <kbd>enter</kbd> for newline
      </div>
    </div>
  );
}
