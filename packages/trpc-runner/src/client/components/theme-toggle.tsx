import { HugeiconsIcon } from "@hugeicons/react";
import { Moon01Icon, Sun01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import type { RunnerTheme } from "../../types";

export function ThemeToggle({ theme, onToggle }: { theme: RunnerTheme; onToggle: () => void }) {
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={onToggle}>
      {theme === "light" ? (
        <HugeiconsIcon icon={Moon01Icon} size={17} />
      ) : (
        <HugeiconsIcon icon={Sun01Icon} size={17} />
      )}
    </Button>
  );
}
