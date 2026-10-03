import { Loader2 } from "lucide-react";

/**
 * Button content that swaps to a spinner and a present-tense label while a
 * mutation is in flight ("Saving…"). It only changes what the button says:
 * the caller still disables the button, which is what actually stops the
 * double click that would send the action twice. The Button primitive dims
 * itself when disabled.
 */
export function BusyLabel({
  busy,
  busyText,
  children,
}: {
  busy: boolean;
  busyText: string;
  children: React.ReactNode;
}) {
  if (!busy) return <>{children}</>;

  return (
    <>
      <Loader2 aria-hidden="true" className="size-3.5 motion-safe:animate-spin" />
      {busyText}
    </>
  );
}
