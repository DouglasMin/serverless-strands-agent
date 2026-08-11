interface Props {
  title: string;
  isNew: boolean;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function Header({ title, isNew, sidebarOpen, onToggleSidebar }: Props) {
  return (
    <header className="header">
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
    </header>
  );
}
