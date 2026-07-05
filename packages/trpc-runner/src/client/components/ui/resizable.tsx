import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

type ResizablePanelGroupProps = Omit<ResizablePrimitive.GroupProps, "orientation"> & {
  autoSaveId?: string;
  direction?: ResizablePrimitive.GroupProps["orientation"];
};

function ResizablePanelGroup({
  autoSaveId,
  className,
  direction = "horizontal",
  id,
  defaultLayout,
  onLayoutChanged,
  ...props
}: ResizablePanelGroupProps) {
  if (autoSaveId) {
    return (
      <PersistedResizablePanelGroup
        autoSaveId={autoSaveId}
        className={className}
        direction={direction}
        id={id}
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        {...props}
      />
    );
  }

  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      orientation={direction}
      id={id}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className={cn("flex h-full w-full aria-[orientation=vertical]:flex-col", className)}
      {...props}
    />
  );
}

function PersistedResizablePanelGroup({
  autoSaveId,
  defaultLayout,
  onLayoutChanged,
  ...props
}: ResizablePanelGroupProps & { autoSaveId: string }) {
  const layoutStorage = ResizablePrimitive.useDefaultLayout({
    id: autoSaveId,
  });

  return (
    <ResizablePanelGroup
      {...props}
      id={props.id ?? autoSaveId}
      defaultLayout={defaultLayout ?? layoutStorage.defaultLayout}
      onLayoutChanged={(layout) => {
        layoutStorage.onLayoutChanged(layout);
        onLayoutChanged?.(layout);
      }}
    />
  );
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean;
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "group/resizable-handle relative flex w-px items-center justify-center bg-border ring-offset-background after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90",
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-6 w-1 shrink-0 rounded-lg bg-border opacity-0 transition-opacity group-hover/resizable-handle:opacity-100 group-focus-visible/resizable-handle:opacity-100 group-data-[separator=active]/resizable-handle:opacity-100 group-data-[separator=hover]/resizable-handle:opacity-100" />
      )}
    </ResizablePrimitive.Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
