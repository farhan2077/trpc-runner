import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ensureEmptyHeaderRow } from "@/lib/helpers";

export function HeadersDialog({
  headers,
  onChange,
  onClose,
}: {
  headers: Record<string, string>;
  onChange: (headers: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(
    Object.entries(headers)
      .map(([key, value]) => ({ key, value }))
      .concat({ key: "", value: "" }),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="min-w-lg">
        <DialogHeader>
          <DialogTitle>Auth headers</DialogTitle>
          <DialogDescription>Stored locally in this browser.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {draft.map((row, index) => (
            <div key={index} className="grid grid-cols-6 gap-2">
              <Input
                placeholder="Header"
                className="col-span-2"
                value={row.key}
                onChange={(e) => {
                  const next = [...draft];
                  next[index] = { ...row, key: e.target.value };
                  setDraft(ensureEmptyHeaderRow(next));
                }}
              />
              <Input
                placeholder="Value"
                className="col-span-4"
                value={row.value}
                onChange={(e) => {
                  const next = [...draft];
                  next[index] = { ...row, value: e.target.value };
                  setDraft(ensureEmptyHeaderRow(next));
                }}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              onChange(
                Object.fromEntries(
                  draft.filter((row) => row.key.trim()).map((row) => [row.key.trim(), row.value]),
                ),
              );
              onClose();
            }}
          >
            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} />
            Save headers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
