import { useEffect } from "react";

const DATA_UPDATED_EVENT = "tagify:dataUpdated";

interface UseGlobalKeyboardShortcutsProps {
  onExternalDataChange?: () => void;
}

/**
 * Hook that LISTENS for data changes from keyboard shortcuts (in KeyboardShortcutService).
 * Translates global events (from service) into React state updates.
 * 
 * The keyboard service is initialized in extension.js at Spotify startup,
 * NOT here. This hook only listens for the custom events that the service
 * dispatches after updating localStorage, allowing React to re-render.
 *
 * Note: The service imported in extension.js (KeyboardShortcutService.ts)
 * and this hook imported in app.tsx are DIFFERENT instances (separate bundles). 
 * They communicate via:
 * 1. localStorage (shared data)
 * 2. window custom events (notifications)
 */
export function useGlobalKeyboardShortcuts({
  onExternalDataChange,
}: UseGlobalKeyboardShortcutsProps = {}) {
  // Listen for data changes from keyboard shortcuts
  useEffect(() => {
    if (!onExternalDataChange) return;

    const handleDataUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.type === "keyboardShortcut") {
        onExternalDataChange(); // reload TagData
      }
    };

    window.addEventListener(DATA_UPDATED_EVENT, handleDataUpdated);
    return () => {
      window.removeEventListener(DATA_UPDATED_EVENT, handleDataUpdated);
    };
  }, [onExternalDataChange]);
}
