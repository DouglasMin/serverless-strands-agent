import type { ChatMessage } from "../../lib/types";

interface UserMessageProps {
  message: ChatMessage;
}

export function UserMessage({ message }: UserMessageProps) {
  return (
    <div className="msg msg--user">
      <div className="msg__card">
        {message.attachments && message.attachments.length > 0 && (
          <div className="msg__user-attachments">
            {message.attachments.map((att, idx) => (
              <span key={`${att.filename}-${idx}`} className="user-attachment-chip">
                📎 {att.filename}
              </span>
            ))}
          </div>
        )}
        <div className="msg__text">{message.text}</div>
      </div>
    </div>
  );
}
