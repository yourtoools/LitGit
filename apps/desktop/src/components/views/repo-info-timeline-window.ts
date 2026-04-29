export interface RepoInfoTimelineWindowInput {
  clientHeight: number;
  prefixHeight: number;
  rowCount: number;
  rowHeight: number;
  scrollTop: number;
  selectedRowIndex: number;
}

export interface RepoInfoTimelineWindowResult {
  bottomSpacerHeight: number;
  endIndex: number;
  startIndex: number;
  topSpacerHeight: number;
}

const DEFAULT_OVERSCAN_ROWS = 12;

export function computeRepoInfoTimelineWindow(
  input: RepoInfoTimelineWindowInput
): RepoInfoTimelineWindowResult {
  const {
    clientHeight,
    prefixHeight,
    rowHeight,
    rowCount,
    scrollTop,
    selectedRowIndex,
  } = input;
  const visibleStart = Math.max(0, scrollTop - prefixHeight);
  const visibleEnd = visibleStart + Math.max(0, clientHeight);
  const virtualStartIndex = Math.max(
    0,
    Math.floor(visibleStart / rowHeight) - DEFAULT_OVERSCAN_ROWS
  );
  const virtualEndIndex = Math.min(
    rowCount,
    Math.ceil(visibleEnd / rowHeight) + DEFAULT_OVERSCAN_ROWS
  );
  const startIndex =
    selectedRowIndex >= 0
      ? Math.min(virtualStartIndex, selectedRowIndex)
      : virtualStartIndex;
  const endIndex =
    selectedRowIndex >= 0
      ? Math.max(virtualEndIndex, selectedRowIndex + 1)
      : virtualEndIndex;

  return {
    bottomSpacerHeight: Math.max(0, rowCount - endIndex) * rowHeight,
    endIndex,
    startIndex,
    topSpacerHeight: startIndex * rowHeight,
  };
}
