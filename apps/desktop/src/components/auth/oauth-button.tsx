import { Button } from "@litgit/ui/components/button";
import { useState } from "react";
import { DisconnectProviderDialog } from "@/components/auth/disconnect-provider-dialog";
import {
  BitbucketIcon,
  GitHubIcon,
  GitLabIcon,
} from "@/components/icons/git-provider-icons";
import type { Provider, ProviderStatus } from "@/lib/tauri-integrations-client";

interface OAuthButtonProps {
  connectButtonClassName?: string;
  connectButtonLabel?: string;
  connectDisabled?: boolean;
  connectIconClassName?: string;
  disconnectedSuffix?: React.ReactNode;
  onConnect: () => void;
  onDisconnect: () => void;
  provider: Provider;
  size?: "default" | "sm" | "xs" | "lg";
  status: ProviderStatus;
}

const PROVIDER_CONFIG: Record<
  Provider,
  {
    color: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    name: string;
  }
> = {
  github: { color: "#24292e", icon: GitHubIcon, name: "GitHub" },
  gitlab: { color: "#fc6d26", icon: GitLabIcon, name: "GitLab" },
  bitbucket: { color: "#2684ff", icon: BitbucketIcon, name: "Bitbucket" },
};

export function OAuthButton({
  provider,
  status,
  onConnect,
  onDisconnect,
  connectButtonClassName,
  connectButtonLabel,
  connectDisabled = false,
  connectIconClassName,
  disconnectedSuffix,
  size = "sm",
}: OAuthButtonProps) {
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const config = PROVIDER_CONFIG[provider];
  const Icon = config.icon;

  if (status.connected) {
    return (
      <>
        <div className="flex w-full items-center gap-2 rounded-lg border border-border/50 bg-muted/40 p-2">
          {status.avatarUrl ? (
            <img
              alt={`${status.username ?? "User"} avatar`}
              className="size-8 rounded-full"
              height={32}
              src={status.avatarUrl}
              width={32}
            />
          ) : (
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/10">
              <Icon size={16} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-sm">
              {status.displayName || status.username}
            </p>
            <p className="text-muted-foreground text-xs">@{status.username}</p>
          </div>
          <Button
            onClick={() => setShowDisconnectDialog(true)}
            size={size}
            variant="outline"
          >
            Disconnect
          </Button>
        </div>
        <DisconnectProviderDialog
          onDisconnect={onDisconnect}
          onOpenChange={setShowDisconnectDialog}
          open={showDisconnectDialog}
          provider={provider}
        />
      </>
    );
  }

  return (
    <div
      className={
        disconnectedSuffix
          ? "grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
          : "grid w-full"
      }
    >
      <Button
        className={connectButtonClassName ?? "w-full justify-start gap-2"}
        disabled={connectDisabled}
        onClick={onConnect}
        size={size}
        variant="outline"
      >
        <Icon className={connectIconClassName} size={16} />
        {connectButtonLabel ?? `Connect ${config.name}`}
      </Button>
      {disconnectedSuffix}
    </div>
  );
}

export function OAuthButtonSkeleton() {
  return (
    <div className="flex w-full animate-pulse items-center gap-2 rounded-lg border border-border/50 bg-muted/40 p-2">
      <div className="size-8 rounded-full bg-muted" />
      <div className="flex-1 space-y-1">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-3 w-16 rounded bg-muted" />
      </div>
    </div>
  );
}
