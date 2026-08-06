import { useEffect, useState } from "react";
import { getUserId } from "../lib/user";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export function AuthCallback() {
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");

    if (!sessionId) {
      setStatus("error");
      setErrorMsg("Missing session_id parameter");
      return;
    }

    const userId = getUserId();

    fetch(
      `${BASE}/api/auth/complete?session_id=${encodeURIComponent(sessionId)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      }
    )
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || body.error) {
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        setStatus("success");
        setTimeout(() => window.close(), 1500);
      })
      .catch((err) => {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : String(err));
      });
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
        color: "#e0e0e0",
        background: "#111",
      }}
    >
      {status === "loading" && <p>Completing authorization...</p>}
      {status === "success" && (
        <p>Authorization complete. This window will close shortly.</p>
      )}
      {status === "error" && (
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#f87171" }}>Authorization failed</p>
          <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>{errorMsg}</p>
        </div>
      )}
    </div>
  );
}
