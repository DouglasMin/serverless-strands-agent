import type { ChatMessage } from "../lib/types";
import { ExportMenu } from "./ExportMenu";

interface Props {
  title: string;
  isNew: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  userEmail?: string;
  onSignOut: () => void;
  messages?: ChatMessage[];
  sessionId?: string | null;
}

export function Header({
  title,
  isNew,
  sidebarOpen,
  onToggleSidebar,
  userEmail,
  onSignOut,
  messages = [],
  sessionId
}: Props) {
  return (
    <header className="header">
      <div className="header__left">
        {!sidebarOpen && (
          <button
            className="header__toggle"
            onClick={onToggleSidebar}
            aria-label="open sidebar"
          >
            <span aria-hidden>☰</span>
          </button>
        )}
        <h1 className="header__title">
          {/* Keyed so a session switch remounts the label and blurs it in. */}
          <span
            key={isNew ? "__new__" : title}
            className={
              "header__title-text" + (isNew ? " header__placeholder" : "")
            }
          >
            {isNew ? "New conversation" : title}
          </span>
        </h1>
      </div>

      <div className="header__right">
        {!isNew && messages.length > 0 && (
          <ExportMenu messages={messages} title={title} sessionId={sessionId} />
        )}

        <button
          className="header__account"
          onClick={onSignOut}
          type="button"
          title={userEmail ? `Sign out of ${userEmail}` : "Sign out"}
        >
          {userEmail ?? "Sign out"}
        </button>
      </div>
    </header>
  );
}
