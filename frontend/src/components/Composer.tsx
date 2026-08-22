import { useEffect, useRef, useState } from "react";
import { AudioVisualizer } from "./AudioVisualizer";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
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

export function Composer({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    if (isListening) stopListening();
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

  return (
    <div className="composer">
      <div className="composer__shell">
        <span className="composer__prefix mono" aria-hidden>
          ▸
        </span>
        <textarea
          ref={ref}
          className="composer__input"
          value={text}
          placeholder={isListening ? "Listening…" : "Message atelier…"}
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
          disabled={disabled || !text.trim()}
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
        <kbd className="mono">Enter</kbd> to send ·{" "}
        <kbd className="mono">Shift</kbd> + <kbd className="mono">Enter</kbd> for
        newline
      </div>
    </div>
  );
}
