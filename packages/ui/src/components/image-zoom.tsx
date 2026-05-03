"use client";

import {
  getBoundedImagePanPosition,
  getCenteredImageZoomTransform,
  hasExceededClickThreshold,
  resolveImageZoomCursor,
} from "@litgit/ui/lib/image-zoom-interaction";
import { cn } from "@litgit/ui/lib/utils";
import type * as React from "react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  type ReactZoomPanPinchContentRef,
  TransformComponent,
  TransformWrapper,
} from "react-zoom-pan-pinch";

const CLICK_THRESHOLD_PX = 3;
const DEFAULT_MIN_SCALE = 0.1;
const DEFAULT_MAX_SCALE = 20;
const FIT_SCALE_TOLERANCE = 0.001;

export interface ImageZoomTransformState {
  positionX: number;
  positionY: number;
  scale: number;
}

export interface ImageZoomRef {
  getCenteredTransform: (scale: number) => ImageZoomTransformState | null;
  getState: () => ImageZoomTransformState;
  resetToFit: () => void;
  setTransform: (positionX: number, positionY: number, scale: number) => void;
}

export interface ImageZoomProps {
  alt: string;
  className?: string;
  fitScale: number;
  isExternalUpdate?: boolean;
  isModifierHeld: boolean;
  maxScale?: number;
  minScale?: number;
  onTransformed?: (state: ImageZoomTransformState) => void;
  onZoomClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  ref?: React.Ref<ImageZoomRef>;
  src: string;
}

function ImageZoom({
  src,
  alt,
  isModifierHeld,
  fitScale,
  minScale = DEFAULT_MIN_SCALE,
  maxScale = DEFAULT_MAX_SCALE,
  onTransformed,
  onZoomClick,
  className,
  isExternalUpdate,
  ref,
}: ImageZoomProps) {
  const transformRef = useRef<ReactZoomPanPinchContentRef | null>(null);
  const dragStartTransformRef = useRef<ImageZoomTransformState | null>(null);
  const mouseDownPositionRef = useRef<{ x: number; y: number } | null>(null);
  const previousFitScaleRef = useRef(fitScale);
  const previousSrcRef = useRef(src);
  const suppressClickRef = useRef(false);
  const externalUpdateRef = useRef(isExternalUpdate ?? false);
  const resetExternalUpdateTimeoutRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    // Parent sync can mark the next transform as external. Imperative calls also
    // flip this flag briefly so local re-centering does not bounce back out
    // through onTransformed and create loops.
    externalUpdateRef.current = isExternalUpdate ?? false;
  }, [isExternalUpdate]);

  const clearExternalUpdateTimeout = useCallback((): void => {
    if (resetExternalUpdateTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(resetExternalUpdateTimeoutRef.current);
    resetExternalUpdateTimeoutRef.current = null;
  }, []);

  const resetPointerState = useCallback((): void => {
    dragStartTransformRef.current = null;
    mouseDownPositionRef.current = null;
    suppressClickRef.current = false;
    setIsDragging(false);
  }, []);

  const getState = useCallback((): ImageZoomTransformState => {
    const state = transformRef.current?.state;

    if (state) {
      return {
        scale: state.scale,
        positionX: state.positionX,
        positionY: state.positionY,
      };
    }

    return {
      scale: fitScale,
      positionX: 0,
      positionY: 0,
    };
  }, [fitScale]);

  const isCloseToScale = useCallback(
    (scale: number, expectedScale: number): boolean =>
      Math.abs(scale - expectedScale) <= FIT_SCALE_TOLERANCE,
    []
  );

  const runExternalTransform = useCallback(
    (callback: (transform: ReactZoomPanPinchContentRef) => void): void => {
      const transform = transformRef.current;

      if (!transform) {
        return;
      }

      clearExternalUpdateTimeout();
      externalUpdateRef.current = true;
      callback(transform);
      resetExternalUpdateTimeoutRef.current = window.setTimeout(() => {
        externalUpdateRef.current = isExternalUpdate ?? false;
        resetExternalUpdateTimeoutRef.current = null;
      }, 0);
    },
    [clearExternalUpdateTimeout, isExternalUpdate]
  );

  useImperativeHandle(
    ref,
    () => ({
      getCenteredTransform(scale: number): ImageZoomTransformState | null {
        const transform = transformRef.current;
        const wrapperComponent = transform?.instance.wrapperComponent;
        const contentComponent = transform?.instance.contentComponent;
        const nextScale = Math.min(Math.max(scale, minScale), maxScale);

        if (!(wrapperComponent && contentComponent)) {
          return null;
        }

        return getCenteredImageZoomTransform({
          contentHeight: contentComponent.offsetHeight,
          contentWidth: contentComponent.offsetWidth,
          scale: nextScale,
          wrapperHeight: wrapperComponent.offsetHeight,
          wrapperWidth: wrapperComponent.offsetWidth,
        });
      },
      setTransform(positionX: number, positionY: number, scale: number): void {
        runExternalTransform((transform) => {
          transform.setTransform(positionX, positionY, scale, 0);
        });
      },
      getState,
      resetToFit(): void {
        runExternalTransform((transform) => {
          transform.centerView(fitScale, 0);
        });
      },
    }),
    [fitScale, getState, maxScale, minScale, runExternalTransform]
  );

  useEffect(() => {
    const previousSrc = previousSrcRef.current;
    const previousFitScale = previousFitScaleRef.current;
    const isNewImage = previousSrc !== src;

    previousSrcRef.current = src;
    previousFitScaleRef.current = fitScale;

    if (isNewImage) {
      runExternalTransform((transform) => {
        transform.centerView(fitScale, 0);
      });
      return;
    }

    const currentState = transformRef.current?.state;

    if (
      !(currentState && isCloseToScale(currentState.scale, previousFitScale))
    ) {
      return;
    }

    runExternalTransform((transform) => {
      transform.centerView(fitScale, 0);
    });
  }, [fitScale, isCloseToScale, runExternalTransform, src]);

  const handleTransformed = useCallback(
    (
      _transform: ReactZoomPanPinchContentRef,
      state: ImageZoomTransformState
    ): void => {
      if (externalUpdateRef.current) {
        return;
      }

      onTransformed?.(state);
    },
    [onTransformed]
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      dragStartTransformRef.current = getState();
      mouseDownPositionRef.current = { x: event.clientX, y: event.clientY };
      suppressClickRef.current = false;
      setIsDragging(false);
    },
    [getState]
  );

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): void => {
      if (suppressClickRef.current) {
        event.preventDefault();
        event.stopPropagation();
        suppressClickRef.current = false;
        return;
      }

      onZoomClick?.(event);
    },
    [onZoomClick]
  );

  useEffect(() => {
    const handleWindowMouseMove = (event: MouseEvent): void => {
      const mouseDownPosition = mouseDownPositionRef.current;
      const dragStartTransform = dragStartTransformRef.current;

      if (
        !hasExceededClickThreshold(
          mouseDownPosition,
          { x: event.clientX, y: event.clientY },
          CLICK_THRESHOLD_PX
        )
      ) {
        return;
      }

      suppressClickRef.current = true;
      setIsDragging(true);

      if (!(mouseDownPosition && dragStartTransform)) {
        return;
      }

      const transform = transformRef.current;
      const wrapperComponent = transform?.instance.wrapperComponent;
      const contentComponent = transform?.instance.contentComponent;

      if (!(transform && wrapperComponent && contentComponent)) {
        return;
      }

      const nextPositionX =
        dragStartTransform.positionX + event.clientX - mouseDownPosition.x;
      const nextPositionY =
        dragStartTransform.positionY + event.clientY - mouseDownPosition.y;
      const boundedPosition = getBoundedImagePanPosition({
        contentHeight: contentComponent.offsetHeight,
        contentWidth: contentComponent.offsetWidth,
        positionX: nextPositionX,
        positionY: nextPositionY,
        scale: dragStartTransform.scale,
        wrapperHeight: wrapperComponent.offsetHeight,
        wrapperWidth: wrapperComponent.offsetWidth,
      });

      transform.setTransform(
        boundedPosition.positionX,
        boundedPosition.positionY,
        dragStartTransform.scale,
        0
      );
    };

    const handleWindowMouseUp = (): void => {
      if (!mouseDownPositionRef.current) {
        return;
      }

      dragStartTransformRef.current = null;
      mouseDownPositionRef.current = null;
      setIsDragging(false);
    };

    const handleWindowBlur = (): void => {
      resetPointerState();
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      clearExternalUpdateTimeout();
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [clearExternalUpdateTimeout, resetPointerState]);

  return (
    <TransformWrapper
      centerOnInit
      doubleClick={{ disabled: true }}
      initialScale={fitScale}
      maxScale={maxScale}
      minScale={minScale}
      onTransform={handleTransformed}
      panning={{
        allowLeftClickPan: false,
        disabled: false,
        velocityDisabled: true,
      }}
      pinch={{ disabled: true }}
      ref={transformRef}
      wheel={{ disabled: true }}
    >
      <TransformComponent
        contentClass="!flex !h-full !w-full items-center justify-center"
        wrapperClass={cn("!h-full !w-full", className)}
        wrapperProps={{
          onClick: handleClick,
          onMouseDown: handleMouseDown,
        }}
        wrapperStyle={{
          cursor: resolveImageZoomCursor({ isDragging, isModifierHeld }),
        }}
      >
        {/* biome-ignore lint/correctness/useImageSize: This generic zoom wrapper does not know image dimensions up front. */}
        <img
          alt={alt}
          className="pointer-events-none max-h-full max-w-full select-none object-contain"
          draggable={false}
          src={src}
        />
      </TransformComponent>
    </TransformWrapper>
  );
}

export { ImageZoom };
