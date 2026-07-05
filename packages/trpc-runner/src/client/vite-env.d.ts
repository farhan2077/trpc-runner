/// <reference types="vite/client" />

import type { RunnerBootData } from "../types";

declare global {
  interface Window {
    __TRPC_RUNNER_DATA__: RunnerBootData;
  }
}
