import {
  Key01Icon,
  Layout05Icon,
  Moon01Icon,
  Moon02Icon,
  MoreHorizontalIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusSignIcon,
  Search01Icon,
  Sun01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ProcedureBadge } from "./procedure-badge";
import type { RunnerProcedure, RunnerTheme } from "../../types";

function filterCommand(value: string, search: string) {
  if (!search) return 1;
  const words = value.toLowerCase().split(/\s+/);
  const searchLower = search.toLowerCase();
  const hasAnyMatch = words.some((word) => word.includes(searchLower));
  return hasAnyMatch ? 1 : 0;
}

function ShortcutKeys({ keys }: { keys: string[] }) {
  if (keys.length < 2) {
    return null;
  }

  return (
    <KbdGroup className="gap-1">
      <Kbd>{keys[0]}</Kbd>
      <HugeiconsIcon
        icon={PlusSignIcon}
        size={10}
        className="text-foreground"
        strokeWidth={2.5}
      />
      <Kbd>{keys[1]}</Kbd>
    </KbdGroup>
  );
}

function RunnerOptionsMenu({
  theme,
  onThemeChange,
  onLayoutReset,
  align = "end",
  side = "bottom",
}: {
  theme: RunnerTheme;
  onThemeChange: (theme: RunnerTheme) => void;
  onLayoutReset: () => void;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Runner options"
        className={buttonVariants({
          variant: "ghost",
          size: "icon",
          className: "h-8 w-8",
        })}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} size={17} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>View</DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <HugeiconsIcon
                icon={theme === "light" ? Sun01Icon : Moon01Icon}
                size={16}
              />
              <span className="flex-1">Theme</span>
              <span className="text-xs capitalize text-muted-foreground">
                {theme}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent side="right" className="w-40">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Appearance</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(value) => onThemeChange(value as RunnerTheme)}
                >
                  <DropdownMenuRadioItem value="light">
                    <HugeiconsIcon icon={Sun01Icon} size={16} />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <HugeiconsIcon icon={Moon02Icon} size={16} />
                    Dark
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={onLayoutReset} variant="destructive">
            <HugeiconsIcon icon={Layout05Icon} size={16} />
            <span>Reset panels</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Help</DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <HugeiconsIcon icon={Key01Icon} size={16} />
              <span>Keyboard shortcuts</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent side="right">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Keyboard shortcuts</DropdownMenuLabel>
                <div className="space-y-0.5 px-1.5 pb-1">
                  <div className="flex items-center justify-between gap-4 py-1 text-sm">
                    <span>Search procedures</span>
                    <ShortcutKeys keys={["Ctrl", "K"]} />
                  </div>
                  <div className="flex items-center justify-between gap-4 py-1 text-sm">
                    <span>Toggle sidebar</span>
                    <ShortcutKeys keys={["Ctrl", "B"]} />
                  </div>
                </div>
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SidebarHeader({
  collapsed,
  visibleProcedures,
  openPaths,
  selectedPath,
  theme,
  commandOpen,
  onSelect,
  onCollapsedChange,
  onCommandOpenChange,
  onThemeChange,
  onHeadersOpen,
  onLayoutReset,
}: {
  collapsed: boolean;
  visibleProcedures: RunnerProcedure[];
  openPaths: string[];
  selectedPath: string;
  theme: RunnerTheme;
  commandOpen: boolean;
  onSelect: (path: string) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onCommandOpenChange: (open: boolean) => void;
  onThemeChange: (theme: RunnerTheme) => void;
  onHeadersOpen: () => void;
  onLayoutReset: () => void;
}) {
  return (
    <>
      <div
        className={
          collapsed
            ? "flex h-full shrink-0 flex-col items-center gap-1 px-0.5 py-1"
            : "flex h-10 shrink-0 items-center justify-between gap-1 border-b px-0.5"
        }
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onCollapsedChange(!collapsed)}
          aria-label={collapsed ? "Show procedures" : "Hide procedures"}
          title={collapsed ? "Show procedures" : "Hide procedures"}
          className="h-8 w-8"
        >
          <HugeiconsIcon
            icon={collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon}
            size={16}
          />
        </Button>
        <div
          className={
            collapsed
              ? "flex min-w-0 flex-col items-center gap-1"
              : "flex min-w-0 flex-1 items-center justify-end gap-0"
          }
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCommandOpenChange(true)}
            aria-label="Search procedures"
            title="Search procedures"
            className="h-8 w-8"
          >
            <HugeiconsIcon icon={Search01Icon} size={16} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onHeadersOpen}
            aria-label="Headers"
            title="Headers"
            className="h-8 w-8"
          >
            <HugeiconsIcon icon={Key01Icon} size={16} />
          </Button>
          <RunnerOptionsMenu
            theme={theme}
            onThemeChange={onThemeChange}
            onLayoutReset={onLayoutReset}
            align={collapsed ? "start" : "end"}
            side={collapsed ? "right" : "bottom"}
          />
        </div>
      </div>

      <CommandDialog
        open={commandOpen}
        onOpenChange={onCommandOpenChange}
        title="Search procedures"
        description="Search and select a tRPC procedure."
        className="max-w-lg"
      >
        <Command filter={filterCommand}>
          <CommandInput placeholder="Search procedures" />
          <CommandList>
            <CommandEmpty>No procedures found.</CommandEmpty>
            <CommandGroup heading="Procedures">
              {visibleProcedures.map((procedure) => (
                <CommandItem
                  key={procedure.pathLabel}
                  value={procedure.pathLabel}
                  keywords={[procedure.kind, procedure.description ?? ""]}
                  onSelect={() => {
                    onSelect(procedure.pathLabel);
                    onCommandOpenChange(false);
                  }}
                >
                  <ProcedureBadge kind={procedure.kind} compact />
                  <span className="truncate">{procedure.pathLabel}</span>
                  {openPaths.includes(procedure.pathLabel) && (
                    <div
                      aria-hidden="true"
                      className={`ml-0 size-1.5 shrink-0 rounded-full ${
                        selectedPath === procedure.pathLabel
                          ? "bg-emerald-500"
                          : "bg-muted-foreground/40"
                      }`}
                    />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
