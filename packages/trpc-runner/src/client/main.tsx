import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./globals.css";
import { configureMonaco } from "./lib/monaco";
import { NuqsAdapter } from "nuqs/adapters/react";

configureMonaco();

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <NuqsAdapter>
      <App />
    </NuqsAdapter>
  </React.StrictMode>,
);
