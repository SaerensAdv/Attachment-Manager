import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./pages/RunsGovernance.css";
import "./pages/ClientOperations.css";

declare const __ATLAS_BUILD_SHA__: string;
(globalThis as typeof globalThis & { __ATLAS_FRONTEND_SHA__?: string }).__ATLAS_FRONTEND_SHA__ = __ATLAS_BUILD_SHA__;

createRoot(document.getElementById("root")!).render(<App />);
