import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthCallback } from "./components/AuthCallback";
import "./index.css";

const isAuthCallback = window.location.pathname === "/auth/callback";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isAuthCallback ? <AuthCallback /> : <App />}
  </StrictMode>
);
