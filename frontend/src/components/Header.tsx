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
          <span className="mono">≡</span>
        </button>
      )}
      <h1 className="header__title">
        {isNew ? (
          <span className="header__placeholder">new conversation</span>
        ) : (
          title
        )}
      </h1>
    </header>
  );
}
