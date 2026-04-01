import { Button } from "@litgit/ui/components/button";
import { SelectValue } from "@litgit/ui/components/select";
import { cn } from "@litgit/ui/lib/utils";
import type React from "react";
import { matchesQuery } from "@/components/views/settings/settings-font-picker";

function SettingsField({
  children,
  description,
  label,
  onJump,
  query,
}: {
  children: React.ReactNode;
  description: string;
  label: string;
  onJump?: () => void;
  query: string;
}) {
  const isHighlighted = matchesQuery(query, [label, description]);

  return (
    <div
      className={cn(
        "grid gap-2 border border-border/60 bg-background/70 p-4 transition-colors md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] md:gap-6",
        isHighlighted && "border-primary/40 bg-primary/5"
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium text-sm">{label}</div>
          {isHighlighted && onJump ? (
            <Button onClick={onJump} size="xs" type="button" variant="ghost">
              Open section
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {description}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function _PlannedField({
  description,
  label,
  query,
}: {
  description: string;
  label: string;
  query: string;
}) {
  const isHighlighted = matchesQuery(query, [label, description, "planned"]);

  return (
    <div
      className={cn(
        "grid gap-1 border border-border/70 border-dashed bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] md:gap-6",
        isHighlighted && "border-primary/50 bg-primary/5"
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium text-sm">{label}</div>
          <span className="rounded-full border border-border/70 px-2 py-0.5 text-[0.65rem] text-muted-foreground uppercase tracking-[0.14em]">
            Planned
          </span>
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {description}
        </p>
      </div>
      <div className="hidden md:block" />
    </div>
  );
}

function SettingsHelpText({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "danger" | "muted" | "warning";
}) {
  return (
    <p
      className={cn(
        "text-xs leading-relaxed",
        tone === "muted" && "text-muted-foreground",
        tone === "warning" && "text-amber-600 dark:text-amber-300",
        tone === "danger" && "text-destructive"
      )}
    >
      {children}
    </p>
  );
}

function SectionActionRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function DefaultSelectValue({
  placeholder = "Not selected",
}: {
  placeholder?: string;
}) {
  return <SelectValue placeholder={placeholder} />;
}

export {
  _PlannedField,
  DefaultSelectValue,
  SectionActionRow,
  SettingsField,
  SettingsHelpText,
};
