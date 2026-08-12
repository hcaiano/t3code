import {
  type ModelSelection,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import type { UnifiedSettings } from "@t3tools/contracts/settings";
import { useEffect, useMemo, useState } from "react";

import { getAppModelOptionsForInstance } from "../../modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  isProviderInstancePickerReady,
  sortProviderInstanceEntries,
} from "../../providerInstances";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { ProviderModelPicker } from "./ProviderModelPicker";

interface PairSessionDialogProps {
  open: boolean;
  busy: boolean;
  providers: ReadonlyArray<ServerProvider>;
  settings: UnifiedSettings;
  initialSelection: ModelSelection;
  onOpenChange: (open: boolean) => void;
  onConfirm: (selection: ModelSelection) => void;
}

export function PairSessionDialog({
  open,
  busy,
  providers,
  settings,
  initialSelection,
  onOpenChange,
  onConfirm,
}: PairSessionDialogProps) {
  const instanceEntries = useMemo(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings),
      ),
    [providers, settings],
  );
  const modelOptionsByInstance = useMemo(() => {
    const options = new Map<ProviderInstanceId, ReturnType<typeof getAppModelOptionsForInstance>>();
    for (const entry of instanceEntries) {
      options.set(entry.instanceId, getAppModelOptionsForInstance(settings, entry));
    }
    return options;
  }, [instanceEntries, settings]);
  const fallbackEntry = instanceEntries.find(isProviderInstancePickerReady);
  const initialEntry = instanceEntries.find(
    (entry) =>
      entry.instanceId === initialSelection.instanceId && isProviderInstancePickerReady(entry),
  );
  const initialInstanceId = initialEntry?.instanceId ?? fallbackEntry?.instanceId ?? null;
  const initialModel =
    (initialInstanceId === initialSelection.instanceId ? initialSelection.model : null) ??
    (initialInstanceId ? modelOptionsByInstance.get(initialInstanceId)?.[0]?.slug : null) ??
    "";
  const [selection, setSelection] = useState<ModelSelection | null>(
    initialInstanceId ? { instanceId: initialInstanceId, model: initialModel } : null,
  );

  useEffect(() => {
    if (!open) return;
    setSelection(initialInstanceId ? { instanceId: initialInstanceId, model: initialModel } : null);
  }, [initialInstanceId, initialModel, open]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Start pair session</DialogTitle>
          <DialogDescription>
            Choose the provider and model for the second agent. Both agents use this project and can
            communicate with each other.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {selection ? (
            <ProviderModelPicker
              activeInstanceId={selection.instanceId}
              model={selection.model}
              lockedProvider={null}
              instanceEntries={instanceEntries}
              modelOptionsByInstance={modelOptionsByInstance}
              disabled={busy}
              triggerVariant="outline"
              triggerClassName="w-full max-w-none"
              triggerAriaLabel="Pair agent model"
              onInstanceModelChange={(instanceId, model) => setSelection({ instanceId, model })}
            />
          ) : (
            <p className="text-muted-foreground text-sm">No provider is available.</p>
          )}
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={busy} />}>Cancel</DialogClose>
          <Button disabled={!selection || busy} onClick={() => selection && onConfirm(selection)}>
            {busy ? "Starting…" : "Start pair"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
