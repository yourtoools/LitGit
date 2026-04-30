import { Button } from "@litgit/ui/components/button";
import { Input } from "@litgit/ui/components/input";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@litgit/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@litgit/ui/components/tooltip";
import { cn } from "@litgit/ui/lib/utils";
import { ArrowLeftIcon, XIcon } from "@phosphor-icons/react";
import type React from "react";
import type { SettingsSectionDefinition } from "@/components/views/settings/settings-store";
import {
  SETTINGS_SECTION_LABELS,
  type SettingsSectionId,
} from "@/stores/preferences/preferences-store-types";

interface SettingsLayoutProps {
  activeDefinition: SettingsSectionDefinition;
  contentPanelRef: React.RefObject<HTMLDivElement | null>;
  filteredSections: SettingsSectionDefinition[];
  getSectionContent: (
    sectionId: SettingsSectionId,
    query: string
  ) => React.ReactNode;
  handleExitPreferences: () => void;
  leftSidebarWidth: number;
  query: string;
  resetSettingsSearch: () => void;
  setSearchQuery: (value: string) => void;
  setSection: (section: SettingsSectionId) => void;
  settingsSearchInputRef: React.RefObject<HTMLInputElement | null>;
  sidebarContainerRef: React.RefObject<HTMLDivElement | null>;
  startSidebarResize: (
    _target: "left"
  ) => (event: React.MouseEvent<HTMLButtonElement>) => void;
  toolbarLabels: boolean;
}

export function SettingsLayout({
  activeDefinition,
  contentPanelRef,
  filteredSections,
  handleExitPreferences,
  leftSidebarWidth,
  query,
  getSectionContent,
  resetSettingsSearch,
  setSearchQuery,
  setSection,
  settingsSearchInputRef,
  sidebarContainerRef,
  startSidebarResize,
  toolbarLabels,
}: SettingsLayoutProps) {
  return (
    <div
      className="flex h-full min-h-0 overflow-hidden bg-background text-foreground"
      ref={sidebarContainerRef}
    >
      <Sidebar
        className="shrink-0 border-border/70 border-r"
        style={{
          width: leftSidebarWidth > 0 ? `${leftSidebarWidth}px` : "0px",
        }}
      >
        <SidebarHeader className="flex flex-col border-border/70 border-b p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs uppercase tracking-wider">
              Settings
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Exit preferences"
                    className="focus-visible:desktop-focus shrink-0 whitespace-nowrap pr-0 text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:ring-0! focus-visible:ring-offset-0! dark:hover:bg-transparent"
                    onClick={handleExitPreferences}
                    size={toolbarLabels ? "sm" : "icon"}
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <ArrowLeftIcon className="size-4 shrink-0" />
                <span className={cn(!toolbarLabels && "hidden")}>Exit</span>
              </TooltipTrigger>
              <TooltipContent
                className={cn(toolbarLabels && "hidden")}
                side="right"
              >
                Exit preferences
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="relative mt-1.5">
            <Input
              className="focus-visible:desktop-focus h-7 pr-7 text-xs focus-visible:ring-0! focus-visible:ring-offset-0!"
              id="settings-search"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search categories (Ctrl + Alt + F)"
              ref={settingsSearchInputRef}
              value={query}
            />
            {query.length > 0 ? (
              <Button
                aria-label="Clear search"
                className="focus-visible:desktop-focus-strong absolute top-1/2 right-0.5 -translate-y-1/2 focus-visible:ring-0! focus-visible:ring-offset-0!"
                onClick={resetSettingsSearch}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <XIcon className="size-3" />
              </Button>
            ) : null}
          </div>
        </SidebarHeader>
        <SidebarContent className="overflow-y-auto px-2.5 py-2.5">
          {filteredSections.length === 0 ? (
            <p className="px-3 py-6 text-center text-muted-foreground text-xs">
              No categories match this search.
            </p>
          ) : (
            <div className="grid gap-1">
              {filteredSections.map((section) => {
                const Icon = section.icon;
                const isActive = section.id === activeDefinition?.id;

                return (
                  <button
                    className={cn(
                      "focus-visible:desktop-focus flex w-full items-center gap-3 px-2 py-2 text-left text-xs transition-colors",
                      isActive
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    )}
                    key={section.id}
                    onClick={() => setSection(section.id)}
                    type="button"
                  >
                    <Icon className="size-4 shrink-0" />
                    {SETTINGS_SECTION_LABELS[section.id]}
                  </button>
                );
              })}
            </div>
          )}
        </SidebarContent>
      </Sidebar>
      <button
        aria-label="Resize left sidebar"
        className="desktop-resize-handle-vertical-focus h-full w-1.5 shrink-0 cursor-col-resize border-border/70 border-r bg-transparent transition-colors hover:bg-accent/30"
        onMouseDown={startSidebarResize("left")}
        type="button"
      />
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-color:color-mix(in_oklab,var(--color-muted-foreground)_55%,transparent)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/45 [&::-webkit-scrollbar-track]:bg-muted/20 [&::-webkit-scrollbar]:w-2"
        id="settings-content-panel"
        ref={contentPanelRef}
      >
        <div className="px-4 py-4 pb-8 sm:px-6 sm:py-6 sm:pb-12">
          <header className="mb-4">
            <h2 className="font-mono font-semibold text-foreground text-lg tracking-tight transition-colors sm:text-xl">
              {SETTINGS_SECTION_LABELS[activeDefinition.id]}
            </h2>
            <p className="mt-2 max-w-3xl text-muted-foreground text-xs leading-relaxed">
              {activeDefinition.description}
            </p>
          </header>
          <div className="border border-primary/15 bg-primary/2.5 p-3 sm:p-4">
            <div className="grid gap-3">
              {getSectionContent(activeDefinition.id, query)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
