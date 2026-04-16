import { Button } from "@litgit/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@litgit/ui/components/dialog";
import type { Provider } from "@/lib/tauri-integrations-client";

interface DisconnectProviderDialogProps {
  onDisconnect: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  provider: Provider | null;
}

export function DisconnectProviderDialog({
  onDisconnect,
  onOpenChange,
  open,
  provider,
}: DisconnectProviderDialogProps) {
  if (!provider) {
    return null;
  }

  const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);

  const handleDisconnect = () => {
    onDisconnect();
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Disconnect Account?</DialogTitle>
          <DialogDescription className="text-xs">
            Are you sure you want to disconnect your {providerName} account?
            This will also remove any associated SSH keys.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            onClick={() => onOpenChange(false)}
            size="sm"
            variant="outline"
          >
            Cancel
          </Button>
          <Button onClick={handleDisconnect} size="sm" variant="destructive">
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
