import {
  isImageZoomModifierHeld,
  resolveModifierHeldFromKeyboardEvent,
} from "@litgit/ui/lib/image-zoom-interaction";
import { useCallback, useEffect, useMemo, useState } from "react";

export const ZOOM_PRESETS = [0.2, 0.5, 1.0, 2.0, 5.0, 10.0] as const;

const FIXED_ZOOM_STEPS = [
  0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.5, 2.0, 3.0, 5.0, 7.0,
  10.0, 15.0, 20.0,
] as const;

const FIT_SCALE_TOLERANCE = 0.001;

export interface ImageZoomOptions {
  containerHeight: number;
  containerWidth: number;
  imageHeight: number;
  imageWidth: number;
}

export interface ImageZoomState {
  fitIndex: number;
  fitScale: number;
  getNextZoomIn: (currentScale: number) => number | null;
  getNextZoomOut: (currentScale: number) => number | null;
  isModifierHeld: boolean;
  steps: number[];
}

function isCloseToFit(scale: number, fitScale: number): boolean {
  return Math.abs(scale - fitScale) <= FIT_SCALE_TOLERANCE;
}

function computeFitScale(options: ImageZoomOptions): number {
  const { imageWidth, imageHeight, containerWidth, containerHeight } = options;

  if (
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    containerWidth <= 0 ||
    containerHeight <= 0
  ) {
    return 1;
  }

  return Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
}

function buildZoomSteps(fitScale: number): number[] {
  const steps: number[] = [];
  let insertedFit = false;

  for (const step of FIXED_ZOOM_STEPS) {
    if (isCloseToFit(step, fitScale)) {
      steps.push(fitScale);
      insertedFit = true;
      continue;
    }

    if (!insertedFit && fitScale < step) {
      steps.push(fitScale);
      insertedFit = true;
    }

    steps.push(step);
  }

  if (!insertedFit) {
    steps.push(fitScale);
  }

  return steps;
}

function getStepAfterCurrent(
  steps: number[],
  currentScale: number
): number | null {
  for (const step of steps) {
    if (step > currentScale + FIT_SCALE_TOLERANCE) {
      return step;
    }
  }

  return null;
}

function getStepBeforeCurrent(
  steps: number[],
  currentScale: number
): number | null {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];

    if (step === undefined) {
      continue;
    }

    if (step < currentScale - FIT_SCALE_TOLERANCE) {
      return step;
    }
  }

  return null;
}

export function formatZoomLabel(scale: number, fitScale: number): string {
  if (isCloseToFit(scale, fitScale)) {
    return "Fit";
  }

  return `${Math.round(scale * 100)}%`;
}

export function useImageZoom(options: ImageZoomOptions): ImageZoomState {
  const { imageWidth, imageHeight, containerWidth, containerHeight } = options;

  const fitScale = useMemo(
    () =>
      computeFitScale({
        imageWidth,
        imageHeight,
        containerWidth,
        containerHeight,
      }),
    [imageWidth, imageHeight, containerWidth, containerHeight]
  );
  const steps = useMemo(() => buildZoomSteps(fitScale), [fitScale]);
  const fitIndex = useMemo(
    () => steps.findIndex((step) => isCloseToFit(step, fitScale)),
    [fitScale, steps]
  );

  const [isModifierHeld, setIsModifierHeld] = useState(false);

  useEffect(() => {
    const syncModifierState = (nextValue: boolean): void => {
      setIsModifierHeld((currentValue) =>
        currentValue === nextValue ? currentValue : nextValue
      );
    };

    const handleKeyboardModifierChange = (event: KeyboardEvent): void => {
      syncModifierState(resolveModifierHeldFromKeyboardEvent(event));
    };

    const handlePointerModifierChange = (
      event: MouseEvent | PointerEvent | WheelEvent
    ): void => {
      syncModifierState(isImageZoomModifierHeld(event));
    };

    const handleBlur = (): void => {
      syncModifierState(false);
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") {
        syncModifierState(false);
      }
    };

    window.addEventListener("keydown", handleKeyboardModifierChange);
    window.addEventListener("keyup", handleKeyboardModifierChange);
    window.addEventListener("pointermove", handlePointerModifierChange);
    window.addEventListener("pointerup", handlePointerModifierChange);
    window.addEventListener("wheel", handlePointerModifierChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("keydown", handleKeyboardModifierChange);
      window.removeEventListener("keyup", handleKeyboardModifierChange);
      window.removeEventListener("pointermove", handlePointerModifierChange);
      window.removeEventListener("pointerup", handlePointerModifierChange);
      window.removeEventListener("wheel", handlePointerModifierChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const getNextZoomIn = useCallback(
    (currentScale: number): number | null =>
      getStepAfterCurrent(steps, currentScale),
    [steps]
  );

  const getNextZoomOut = useCallback(
    (currentScale: number): number | null =>
      getStepBeforeCurrent(steps, currentScale),
    [steps]
  );

  return {
    fitScale,
    steps,
    fitIndex,
    isModifierHeld,
    getNextZoomIn,
    getNextZoomOut,
  };
}
