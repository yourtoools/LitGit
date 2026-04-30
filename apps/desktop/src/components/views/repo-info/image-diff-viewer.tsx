import {
  ImageZoom,
  type ImageZoomRef,
  type ImageZoomTransformState,
} from "@litgit/ui/components/image-zoom";
import { ImageZoomControls } from "@litgit/ui/components/image-zoom-controls";
import { useImageZoom } from "@litgit/ui/hooks/use-image-zoom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type WheelEvent,
} from "react";
import { useReducerState } from "@/hooks/use-reducer-state";

interface ImageDiffViewerProps {
  filePath: string;
  newImageSrc: string | null;
  oldImageSrc: string | null;
  splitView: boolean;
}

interface ImageDimensions {
  height: number;
  width: number;
}

const FIT_SCALE_TOLERANCE = 0.001;
const MAX_ZOOM_SCALE = 20;

function isCloseToScale(scale: number, expectedScale: number): boolean {
  return Math.abs(scale - expectedScale) <= FIT_SCALE_TOLERANCE;
}

function resolveFitScale(
  container: ImageDimensions,
  image: ImageDimensions | null
): number {
  if (
    image === null ||
    image.width <= 0 ||
    image.height <= 0 ||
    container.width <= 0 ||
    container.height <= 0
  ) {
    return 1;
  }

  return Math.min(
    container.width / image.width,
    container.height / image.height,
    MAX_ZOOM_SCALE
  );
}

function createZoomOptionsForFitScale(fitScale: number): ImageDimensions {
  const safeFitScale = fitScale > 0 ? fitScale : 1;
  const inverseFitScale = 1 / safeFitScale;

  return {
    width: inverseFitScale,
    height: inverseFitScale,
  };
}

function useElementSize<TElement extends HTMLElement>(): {
  ref: (node: TElement | null) => void;
  size: ImageDimensions;
} {
  const [element, updateElement] = useReducerState<TElement | null>(null);
  const [size, updateSize] = useReducerState<ImageDimensions>({
    width: 0,
    height: 0,
  });

  const ref = useCallback(
    (node: TElement | null): void => {
      updateElement(node);
    },
    [updateElement]
  );

  useEffect(() => {
    if (element === null) {
      updateSize({ width: 0, height: 0 });
      return;
    }

    const syncSize = (): void => {
      updateSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    syncSize();

    const resizeObserver = new ResizeObserver(() => {
      syncSize();
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [element, updateSize]);

  return { ref, size };
}

function useImageDimensions(src: string | null): ImageDimensions | null {
  const [dimensions, updateDimensions] =
    useReducerState<ImageDimensions | null>(null);

  useEffect(() => {
    if (src === null) {
      updateDimensions(null);
      return;
    }

    let isCancelled = false;
    const image = new window.Image();

    const handleLoad = (): void => {
      if (isCancelled) {
        return;
      }

      updateDimensions({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };

    const handleError = (): void => {
      if (isCancelled) {
        return;
      }

      updateDimensions(null);
    };

    image.addEventListener("load", handleLoad);
    image.addEventListener("error", handleError);
    image.src = src;

    return () => {
      isCancelled = true;
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
    };
  }, [src, updateDimensions]);

  return dimensions;
}

export function ImageDiffViewer({
  filePath,
  newImageSrc,
  oldImageSrc,
  splitView,
}: ImageDiffViewerProps) {
  const oldImageRef = useRef<ImageZoomRef | null>(null);
  const newImageRef = useRef<ImageZoomRef | null>(null);
  const singleImageRef = useRef<ImageZoomRef | null>(null);
  const currentTransformRef = useRef<ImageZoomTransformState>({
    positionX: 0,
    positionY: 0,
    scale: 1,
  });
  const previousFitScaleRef = useRef(1);
  const previousSourcesRef = useRef({
    newImageSrc,
    oldImageSrc,
    splitView,
  });

  const oldImageDimensions = useImageDimensions(oldImageSrc);
  const newImageDimensions = useImageDimensions(newImageSrc);
  const { ref: oldPaneRef, size: oldPaneSize } =
    useElementSize<HTMLDivElement>();
  const { ref: newPaneRef, size: newPaneSize } =
    useElementSize<HTMLDivElement>();
  const { ref: singlePaneRef, size: singlePaneSize } =
    useElementSize<HTMLDivElement>();

  const centeredImageSrc = newImageSrc ?? oldImageSrc;
  const centeredImageDimensions =
    newImageSrc === null ? oldImageDimensions : newImageDimensions;

  const desiredFitScale = useMemo(() => {
    if (!splitView) {
      return resolveFitScale(singlePaneSize, centeredImageDimensions);
    }

    const candidateFitScales: number[] = [];

    if (oldImageSrc !== null) {
      candidateFitScales.push(resolveFitScale(oldPaneSize, oldImageDimensions));
    }

    if (newImageSrc !== null) {
      candidateFitScales.push(resolveFitScale(newPaneSize, newImageDimensions));
    }

    if (candidateFitScales.length === 0) {
      return 1;
    }

    return Math.min(...candidateFitScales);
  }, [
    centeredImageDimensions,
    newImageDimensions,
    newImageSrc,
    newPaneSize,
    oldImageDimensions,
    oldImageSrc,
    oldPaneSize,
    singlePaneSize,
    splitView,
  ]);

  const zoomSizing = createZoomOptionsForFitScale(desiredFitScale);
  const { fitScale, getNextZoomIn, getNextZoomOut, isModifierHeld } =
    useImageZoom({
      containerWidth: 1,
      containerHeight: 1,
      imageWidth: zoomSizing.width,
      imageHeight: zoomSizing.height,
    });
  const [currentScale, updateCurrentScale] = useReducerState(fitScale);

  const hasZoomTarget = splitView
    ? oldImageSrc !== null || newImageSrc !== null
    : centeredImageSrc !== null;

  const syncOtherPane = useCallback(
    (source: "new" | "old", state: ImageZoomTransformState): void => {
      currentTransformRef.current = state;
      updateCurrentScale(state.scale);

      if (source === "old") {
        newImageRef.current?.setTransform(
          state.positionX,
          state.positionY,
          state.scale
        );
        return;
      }

      oldImageRef.current?.setTransform(
        state.positionX,
        state.positionY,
        state.scale
      );
    },
    [updateCurrentScale]
  );

  const commitTransformState = useCallback(
    (state: ImageZoomTransformState): void => {
      currentTransformRef.current = state;
      updateCurrentScale(state.scale);
    },
    [updateCurrentScale]
  );

  const syncStateFromActiveZoom = useCallback((): void => {
    if (!hasZoomTarget) {
      commitTransformState({
        positionX: 0,
        positionY: 0,
        scale: fitScale,
      });
      return;
    }

    if (!splitView) {
      const nextState = singleImageRef.current?.getState();

      if (nextState) {
        commitTransformState(nextState);
      }

      return;
    }

    const primaryZoomRef = oldImageRef.current ?? newImageRef.current;
    const secondaryZoomRef =
      primaryZoomRef === oldImageRef.current
        ? newImageRef.current
        : oldImageRef.current;
    const nextState = primaryZoomRef?.getState();

    if (!nextState) {
      return;
    }

    commitTransformState(nextState);
    secondaryZoomRef?.setTransform(
      nextState.positionX,
      nextState.positionY,
      nextState.scale
    );
  }, [commitTransformState, fitScale, hasZoomTarget, splitView]);

  useEffect(() => {
    const previousFitScale = previousFitScaleRef.current;
    const previousSources = previousSourcesRef.current;
    const sourceChanged =
      previousSources.oldImageSrc !== oldImageSrc ||
      previousSources.newImageSrc !== newImageSrc ||
      previousSources.splitView !== splitView;

    previousFitScaleRef.current = fitScale;
    previousSourcesRef.current = {
      newImageSrc,
      oldImageSrc,
      splitView,
    };

    if (sourceChanged || isCloseToScale(currentScale, previousFitScale)) {
      currentTransformRef.current = {
        positionX: 0,
        positionY: 0,
        scale: fitScale,
      };
      updateCurrentScale(fitScale);

      const frameId = window.requestAnimationFrame(() => {
        syncStateFromActiveZoom();
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }
  }, [
    currentScale,
    fitScale,
    newImageSrc,
    oldImageSrc,
    splitView,
    syncStateFromActiveZoom,
    updateCurrentScale,
  ]);

  const applyTransform = useCallback(
    (transform: ImageZoomTransformState): void => {
      commitTransformState(transform);

      if (splitView) {
        oldImageRef.current?.setTransform(
          transform.positionX,
          transform.positionY,
          transform.scale
        );
        newImageRef.current?.setTransform(
          transform.positionX,
          transform.positionY,
          transform.scale
        );
        return;
      }

      singleImageRef.current?.setTransform(
        transform.positionX,
        transform.positionY,
        transform.scale
      );
    },
    [commitTransformState, splitView]
  );

  const zoomToScale = useCallback(
    (nextScale: number | null): void => {
      if (!(hasZoomTarget && nextScale !== null)) {
        return;
      }

      const activeZoomTarget = splitView
        ? (oldImageRef.current ?? newImageRef.current)
        : singleImageRef.current;
      const nextTransform = activeZoomTarget?.getCenteredTransform(
        nextScale
      ) ?? {
        ...currentTransformRef.current,
        scale: nextScale,
      };

      applyTransform(nextTransform);
    },
    [applyTransform, hasZoomTarget, splitView]
  );

  const handleZoomIn = useCallback((): void => {
    zoomToScale(getNextZoomIn(currentTransformRef.current.scale));
  }, [getNextZoomIn, zoomToScale]);

  const handleZoomOut = useCallback((): void => {
    zoomToScale(getNextZoomOut(currentTransformRef.current.scale));
  }, [getNextZoomOut, zoomToScale]);

  const handleFit = useCallback((): void => {
    if (!hasZoomTarget) {
      return;
    }

    if (splitView) {
      (oldImageRef.current ?? newImageRef.current)?.resetToFit();
      syncStateFromActiveZoom();
      return;
    }

    singleImageRef.current?.resetToFit();
    syncStateFromActiveZoom();
  }, [hasZoomTarget, splitView, syncStateFromActiveZoom]);

  const handleZoomClick = useCallback(
    (shouldZoomOut: boolean): void => {
      const activeZoomTarget = splitView
        ? (oldImageRef.current ?? newImageRef.current)
        : singleImageRef.current;
      const activeScale =
        activeZoomTarget?.getState().scale ?? currentTransformRef.current.scale;

      zoomToScale(
        shouldZoomOut ? getNextZoomOut(activeScale) : getNextZoomIn(activeScale)
      );
    },
    [getNextZoomIn, getNextZoomOut, splitView, zoomToScale]
  );

  const handleSingleZoomClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      handleZoomClick(event.ctrlKey || event.metaKey);
    },
    [handleZoomClick]
  );

  const handleOldZoomClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      handleZoomClick(event.ctrlKey || event.metaKey);
    },
    [handleZoomClick]
  );

  const handleNewZoomClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      handleZoomClick(event.ctrlKey || event.metaKey);
    },
    [handleZoomClick]
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>): void => {
      if (!(hasZoomTarget && (event.ctrlKey || event.metaKey))) {
        return;
      }

      event.preventDefault();

      if (event.deltaY < 0) {
        handleZoomIn();
        return;
      }

      if (event.deltaY > 0) {
        handleZoomOut();
      }
    },
    [handleZoomIn, handleZoomOut, hasZoomTarget]
  );

  const canZoomIn = hasZoomTarget && getNextZoomIn(currentScale) !== null;
  const canZoomOut = hasZoomTarget && getNextZoomOut(currentScale) !== null;

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden bg-muted/10 p-3"
      onWheel={handleWheel}
    >
      {splitView ? (
        <div className="grid h-full min-h-0 grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border/70 bg-background">
            <p className="border-border/70 border-b px-3 py-2 font-medium text-xs uppercase tracking-wide">
              Original
            </p>
            <div
              className="relative min-h-0 flex-1 overflow-hidden bg-muted/10"
              ref={oldPaneRef}
            >
              {oldImageSrc ? (
                <ImageZoom
                  alt={`Original version of ${filePath}`}
                  className="h-full w-full"
                  fitScale={fitScale}
                  isModifierHeld={isModifierHeld}
                  onTransformed={(state) => {
                    syncOtherPane("old", state);
                  }}
                  onZoomClick={handleOldZoomClick}
                  ref={oldImageRef}
                  src={oldImageSrc}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center">
                  <p className="text-muted-foreground text-xs">
                    No image in the previous revision.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border/70 bg-background">
            <p className="border-border/70 border-b px-3 py-2 font-medium text-xs uppercase tracking-wide">
              Modified
            </p>
            <div
              className="relative min-h-0 flex-1 overflow-hidden bg-muted/10"
              ref={newPaneRef}
            >
              {newImageSrc ? (
                <ImageZoom
                  alt={`Modified version of ${filePath}`}
                  className="h-full w-full"
                  fitScale={fitScale}
                  isModifierHeld={isModifierHeld}
                  onTransformed={(state) => {
                    syncOtherPane("new", state);
                  }}
                  onZoomClick={handleNewZoomClick}
                  ref={newImageRef}
                  src={newImageSrc}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center">
                  <p className="text-muted-foreground text-xs">
                    No image in this revision.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="relative flex h-full min-h-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-background"
          ref={singlePaneRef}
        >
          {centeredImageSrc ? (
            <ImageZoom
              alt={filePath}
              className="h-full w-full"
              fitScale={fitScale}
              isModifierHeld={isModifierHeld}
              onTransformed={(state) => {
                commitTransformState(state);
              }}
              onZoomClick={handleSingleZoomClick}
              ref={singleImageRef}
              src={centeredImageSrc}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <p className="text-muted-foreground text-xs">
                No preview available for this image revision.
              </p>
            </div>
          )}
        </div>
      )}

      {hasZoomTarget ? (
        <ImageZoomControls
          canZoomIn={canZoomIn}
          canZoomOut={canZoomOut}
          currentScale={currentScale}
          fitScale={fitScale}
          onFit={handleFit}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomTo={zoomToScale}
        />
      ) : null}
    </div>
  );
}
