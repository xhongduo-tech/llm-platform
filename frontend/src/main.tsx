import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

// ── Motion: respect prefers-reduced-motion & degrade on old browsers ──────
// Old browsers that don't support the Web Animations API will silently skip
// transforms; this makes Framer Motion skip its JS-driven transforms too so
// the layout stays correct (elements don't get stuck mid-animation).
if (typeof window !== "undefined") {
  const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  // Expose a global flag that can be read by components
  (window as any).__motionReduced =
    mq?.matches ||
    // CSS custom-property check: if the browser can't compute 'var()' at all,
    // it's too old for CSS animations — skip them entirely.
    getComputedStyle(document.documentElement)
      .getPropertyValue("--background")
      .trim() === "";
}

createRoot(document.getElementById("root")!).render(<App />);
