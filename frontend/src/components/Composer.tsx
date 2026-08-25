import React, { useEffect, useRef, useState, useMemo } from "react";
import { uploadFileToS3 } from "../lib/api";
import type { FileAttachment } from "../lib/types";
import { AudioVisualizer } from "./AudioVisualizer";
import { ModePills, AGENT_MODES, type AgentMode } from "./composer/ModePills";
import { SlashCommandMenu, SLASH_COMMANDS, type SlashCommand } from "./composer/SlashCommandMenu";

interface Props {
  onSend: (text: string, attachments?: FileAttachment[]) => void;
  disabled?: boolean;
  sessionId?: string | null;
}

// Browser SpeechRecognition interface
interface SpeechRecognitionEvent extends Event {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal?: boolean;
    };
    length: number;
  };
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: Event) => void;
  onend: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileIcon(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["csv", "tsv", "xlsx", "xls"].includes(ext)) return "📊";
  if (["doc", "docx", "txt", "md", "pdf"].includes(ext)) return "📄";
  if (["png", "jpg", "jpeg", "webp", "svg"].includes(ext)) return "🖼️";
  if (["json", "py", "js", "ts", "html"].includes(ext)) return "💻";
  return "📎";
}

export function Composer({ onSend, disabled, sessionId }: Props) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [activeMode, setActiveMode] = useState<AgentMode>("auto");
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  // Slash Command Menu State
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);

  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const activeModeItem = useMemo(
    () => AGENT_MODES.find((m) => m.id === activeMode) || AGENT_MODES[0],
    [activeMode]
  );

  // Determine if slash command popup should show
  const isSlashActive = useMemo(() => {
    if (slashDismissed || !text.startsWith("/")) return false;
    // Show slash menu if cursor is on the first token (no space yet)
    return !text.includes(" ");
  }, [text, slashDismissed]);

  const filteredCommands = useMemo(() => {
    if (!isSlashActive) return [];
    const query = text.toLowerCase().replace(/^\//, "").trim();
    return SLASH_COMMANDS.filter((cmd) => {
      if (!query) return true;
      return (
        cmd.command.toLowerCase().includes(query) ||
        cmd.label.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query) ||
        cmd.id.toLowerCase().includes(query)
      );
    });
  }, [text, isSlashActive]);

  const handleFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0 || disabled) return;
    setIsUploading(true);

    const newAttachments: FileAttachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const uploaded = await uploadFileToS3(file, sessionId || undefined);
        newAttachments.push(uploaded);
      } catch (err) {
        console.error(`Failed to upload ${file.name}:`, err);
        newAttachments.push({
          filename: file.name,
          s3Uri: "",
          key: "",
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          error: "Upload failed"
        });
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
    setIsUploading(false);
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSelectCommand = (cmd: SlashCommand) => {
    if (cmd.mode && cmd.mode !== "auto") {
      setActiveMode(cmd.mode as AgentMode);
    }
    setText(cmd.template);
    setSlashDismissed(true);
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.focus();
        ref.current.setSelectionRange(cmd.template.length, cmd.template.length);
      }
    });
  };

  const submit = () => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || disabled || isUploading) return;
    if (isListening) stopListening();

    // If a specialized mode is active and prompt doesn't already start with template prefix
    let finalPrompt = trimmed;
    if (activeMode !== "auto" && activeModeItem.promptPrefix) {
      if (!trimmed.toLowerCase().startsWith(activeModeItem.promptPrefix.toLowerCase().slice(0, 10))) {
        finalPrompt = `${activeModeItem.promptPrefix}${trimmed}`;
      }
    }

    const validAttachments = attachments.filter((a) => a.s3Uri && !a.error);
    onSend(finalPrompt, validAttachments.length > 0 ? validAttachments : undefined);

    setText("");
    setAttachments([]);
    setSlashDismissed(false);
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

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);

      const SpeechRecognitionClass =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (SpeechRecognitionClass) {
        const recognition = new SpeechRecognitionClass();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || "en-US";

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let transcript = "";
          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
          }
          if (transcript) {
            setText((prev) => {
              const base = prev.trim();
              return base ? `${base} ${transcript.trim()}` : transcript.trim();
            });
          }
        };

        recognition.onerror = (e) => {
          console.warn("Speech recognition error:", e);
          stopListening();
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
      }

      setIsListening(true);
    } catch (err) {
      console.warn("Microphone access denied or unavailable:", err);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      setMediaStream(null);
    }
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      void startListening();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle Slash Command Menu Keyboard Navigation
    if (isSlashActive && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIndex((prev) => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const cmd = filteredCommands[slashIndex] || filteredCommands[0];
        if (cmd) handleSelectCommand(cmd);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashDismissed(true);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      className={`composer ${isDragging ? "is-dragging" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files) {
            void handleFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* Floating Slash Command Autocomplete Menu */}
      {isSlashActive && (
        <SlashCommandMenu
          filterText={text}
          selectedIndex={slashIndex}
          onSelect={handleSelectCommand}
          onClose={() => setSlashDismissed(true)}
        />
      )}

      {/* Quick Mode Toggles Bar */}
      <ModePills
        activeMode={activeMode}
        onSelectMode={(mode) => {
          setActiveMode(mode);
          ref.current?.focus();
        }}
        disabled={disabled}
      />

      {/* Uploaded attachment chips preview */}
      {attachments.length > 0 && (
        <div className="composer__attachments">
          {attachments.map((att, idx) => (
            <div
              key={`${att.filename}-${idx}`}
              className={`attachment-chip ${att.error ? "attachment-chip--error" : ""}`}
            >
              <span className="attachment-chip__icon" aria-hidden>
                {getFileIcon(att.filename)}
              </span>
              <span className="attachment-chip__name" title={att.filename}>
                {att.filename}
              </span>
              <span className="attachment-chip__size">
                {formatBytes(att.sizeBytes)}
              </span>
              {att.error && (
                <span className="attachment-chip__error">{att.error}</span>
              )}
              <button
                type="button"
                className="attachment-chip__remove"
                onClick={() => removeAttachment(idx)}
                title="Remove attachment"
              >
                ✕
              </button>
            </div>
          ))}
          {isUploading && (
            <div className="attachment-chip attachment-chip--uploading">
              <span className="attachment-chip__spinner" />
              <span>Uploading to S3…</span>
            </div>
          )}
        </div>
      )}

      <div className="composer__shell">
        <span className="composer__prefix mono" aria-hidden>
          ▸
        </span>

        {/* Active Mode Chip inside Composer */}
        {activeMode !== "auto" && (
          <div className="composer__mode-chip">
            <span className="mode-chip__icon">{activeModeItem.icon}</span>
            <span className="mode-chip__label mono">{activeModeItem.label}</span>
            <button
              type="button"
              className="mode-chip__remove"
              onClick={() => setActiveMode("auto")}
              title="Reset to Auto mode"
            >
              ✕
            </button>
          </div>
        )}

        {/* Paperclip upload button */}
        <button
          type="button"
          className="composer__attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          title="Attach dataset or document (S3 upload)"
          aria-label="Attach file"
        >
          <span className="composer__attach-icon" aria-hidden>
            📎
          </span>
        </button>

        <textarea
          ref={ref}
          className="composer__input"
          value={text}
          placeholder={
            isDragging
              ? "Drop files to attach to Code Interpreter…"
              : isListening
              ? "Listening…"
              : activeMode !== "auto"
              ? activeModeItem.placeholder
              : "Message atelier, type / for commands, or drop datasets…"
          }
          onChange={(e) => {
            setText(e.target.value);
            if (slashDismissed && !e.target.value.startsWith("/")) {
              setSlashDismissed(false);
            }
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
          spellCheck
        />

        {isListening && (
          <div className="composer__visualizer">
            <AudioVisualizer stream={mediaStream} active={isListening} />
          </div>
        )}

        <button
          type="button"
          className={`composer__mic-btn ${isListening ? "is-listening" : ""}`}
          onClick={toggleListening}
          disabled={disabled}
          title={isListening ? "Stop listening" : "Voice input"}
          aria-label={isListening ? "Stop listening" : "Voice input"}
        >
          <span className="composer__mic-icon" aria-hidden>
            {isListening ? "●" : "🎙"}
          </span>
        </button>

        <button
          className="composer__send"
          onClick={submit}
          disabled={disabled || isUploading || (!text.trim() && attachments.length === 0)}
          aria-label="send message"
        >
          <span
            key={disabled ? "waiting" : "ready"}
            className="composer__send-icon"
            aria-hidden
          >
            {disabled ? "…" : "↵"}
          </span>
        </button>
      </div>

      <div className="composer__hint">
        <kbd className="mono">/</kbd> for quick commands · <kbd className="mono">Enter</kbd> to send ·{" "}
        <kbd className="mono">Shift</kbd> + <kbd className="mono">Enter</kbd> for
        newline · drag & drop files
      </div>
    </div>
  );
}
