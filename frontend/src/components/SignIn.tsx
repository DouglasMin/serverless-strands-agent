interface Props {
  onSignIn: () => void;
  error?: string;
  busy?: boolean;
}

export function SignIn({ onSignIn, error, busy = false }: Props) {
  return (
    <div className="signin">
      <div className="signin__panel">
        <div className="signin__mark" aria-hidden />
        <h1 className="signin__title">Serverless Strands</h1>
        <p className="signin__hint">
          Sign in to reach your conversations, memory, and connected tools.
        </p>

        <button
          className="signin__button"
          onClick={onSignIn}
          disabled={busy}
          type="button"
        >
          <img src="/tool-icons/google-search.svg" alt="" width={16} height={16} />
          {busy ? "Redirecting…" : "Continue with Google"}
        </button>

        {error && (
          <p className="signin__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
