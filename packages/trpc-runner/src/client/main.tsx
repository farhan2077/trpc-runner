import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./globals.css";
import { NuqsAdapter } from "nuqs/adapters/react";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <NuqsAdapter>
      <App />
    </NuqsAdapter>
  </React.StrictMode>,
);
