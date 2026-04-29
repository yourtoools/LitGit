import { useEffect, useRef, useState } from "react";

interface UseGroupHoverIntentReturn {
  clearGroupHoverState: () => void;
  hoveredGroupId: string | null;
  queueHoveredGroup: (groupId: string) => void;
}

const HOVER_INTENT_DELAY_MS = 200;

export const useGroupHoverIntent = (): UseGroupHoverIntentReturn => {
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTimerGroupIdRef = useRef<string | null>(null);

  const clearGroupHoverState = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
      hoverTimerGroupIdRef.current = null;
    }

    setHoveredGroupId(null);
  };

  const queueHoveredGroup = (groupId: string) => {
    if (hoveredGroupId === groupId) {
      return;
    }

    if (
      hoverTimerRef.current &&
      hoverTimerGroupIdRef.current &&
      hoverTimerGroupIdRef.current !== groupId
    ) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
      hoverTimerGroupIdRef.current = null;
    }

    if (hoverTimerRef.current && hoverTimerGroupIdRef.current === groupId) {
      return;
    }

    hoverTimerGroupIdRef.current = groupId;
    hoverTimerRef.current = setTimeout(() => {
      setHoveredGroupId(groupId);
      hoverTimerRef.current = null;
      hoverTimerGroupIdRef.current = null;
    }, HOVER_INTENT_DELAY_MS);
  };

  useEffect(
    () => () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    },
    []
  );

  return {
    hoveredGroupId,
    clearGroupHoverState,
    queueHoveredGroup,
  };
};
