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
        "grid gap-2 border border-border/60 bg-background/70 p-3 transition-colors md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] md:gap-4",
        isHighlighted && "border-primary/40 bg-primary/5"
      )}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="font-medium text-xs">{label}</div>
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
  DefaultSelectValue,
  SectionActionRow,
  SettingsField,
  SettingsHelpText,
};
