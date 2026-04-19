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
      <DialogContent className="gap-3 p-3 text-xs sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Disconnect Account?</DialogTitle>
          <DialogDescription className="text-xs">
            Are you sure you want to disconnect your {providerName} account?
            This will also remove any associated SSH keys.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="-mx-3 -mb-3 gap-2 p-3">
          <Button
            className="text-xs"
            onClick={() => onOpenChange(false)}
            size="sm"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="text-xs"
            onClick={handleDisconnect}
            size="sm"
            variant="destructive"
          >
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
