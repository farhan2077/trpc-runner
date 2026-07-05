import { Badge } from "@/components/ui/badge";
import type { ProcedureKind } from "../../types";

const variantMap: Record<ProcedureKind, "default" | "outline"> = {
  query: "default",
  mutation: "default",
  subscription: "outline",
};

export function ProcedureBadge({ kind, compact }: { kind: ProcedureKind; compact?: boolean }) {
  return (
    <Badge variant={variantMap[kind]} className="h-4 px-1 rounded tabular-nums font-mono">
      {compact ? kind.slice(0, 1).toUpperCase() : kind.toUpperCase()}
    </Badge>
  );
}
