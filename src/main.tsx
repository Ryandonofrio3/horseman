import { scan } from "react-scan";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

// Enable React Scan in development
if (import.meta.env.DEV) {
  scan({ enabled: true });
}
import App from "./App";
import { useStore } from "./store";
import { DiffsProvider } from "./providers/DiffsProvider";
import "./styles/globals.css";

// Dev tools for synthetic event testing
if (import.meta.env.DEV) {
  import("./lib/devEvents").then(({ initDevTools }) => initDevTools());
}

function HydrationGuard({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    // Check if already hydrated (sync storage case)
    if (useStore.persist.hasHydrated()) {
      setHydrated(true);
    }
    return unsub;
  }, []);

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HydrationGuard>
      <DiffsProvider>
        <App />
      </DiffsProvider>
    </HydrationGuard>
  </React.StrictMode>,
);
