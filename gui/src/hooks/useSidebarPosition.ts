import { useState } from "react";
import { useWebviewListener } from "./useWebviewListener";

/**
 * Hook to track the VS Code sidebar position (left or right).
 * Reads the initial value from window.sidebarPosition (injected by extension)
 * and listens for dynamic updates via the setSidebarPosition message.
 */
export function useSidebarPosition(): "left" | "right" {
  const [position, setPosition] = useState<"left" | "right">(
    () => ((window as any).sidebarPosition as "left" | "right") || "left",
  );

  useWebviewListener(
    "setSidebarPosition",
    async (data) => {
      setPosition(data.position);
    },
    [setPosition],
  );

  return position;
}
