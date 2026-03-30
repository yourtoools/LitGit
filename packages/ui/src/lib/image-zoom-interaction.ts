export interface PointerPosition {
  x: number;
  y: number;
}

export interface CenteredImageZoomTransformOptions {
  contentHeight: number;
  contentWidth: number;
  scale: number;
  wrapperHeight: number;
  wrapperWidth: number;
}

export interface ImageZoomCursorOptions {
  isDragging: boolean;
  isModifierHeld: boolean;
}

export interface ImageZoomModifierEvent {
  ctrlKey: boolean;
  metaKey: boolean;
}

export interface ImageZoomKeyboardModifierEvent extends ImageZoomModifierEvent {
  key: string;
  type: string;
}

export interface BoundedImagePanPositionOptions {
  contentHeight: number;
  contentWidth: number;
  positionX: number;
  positionY: number;
  scale: number;
  wrapperHeight: number;
  wrapperWidth: number;
}

export function getCenteredImageZoomTransform(
  options: CenteredImageZoomTransformOptions
): { positionX: number; positionY: number; scale: number } {
  const { scale, wrapperWidth, wrapperHeight, contentWidth, contentHeight } =
    options;

  return {
    scale,
    positionX: (wrapperWidth - contentWidth * scale) / 2,
    positionY: (wrapperHeight - contentHeight * scale) / 2,
  };
}

export function hasExceededClickThreshold(
  startPosition: PointerPosition | null,
  currentPosition: PointerPosition,
  threshold: number
): boolean {
  if (startPosition === null) {
    return false;
  }

  const deltaX = Math.abs(currentPosition.x - startPosition.x);
  const deltaY = Math.abs(currentPosition.y - startPosition.y);

  return deltaX >= threshold || deltaY >= threshold;
}

export function isImageZoomModifierHeld(
  event: ImageZoomModifierEvent
): boolean {
  return event.ctrlKey || event.metaKey;
}

export function resolveModifierHeldFromKeyboardEvent(
  event: ImageZoomKeyboardModifierEvent
): boolean {
  if (
    event.type === "keyup" &&
    (event.key === "Control" || event.key === "Meta")
  ) {
    return false;
  }

  return isImageZoomModifierHeld(event);
}

function clampPosition(
  position: number,
  minimum: number,
  maximum: number
): number {
  if (minimum === maximum) {
    return minimum;
  }

  return Math.min(Math.max(position, minimum), maximum);
}

export function getBoundedImagePanPosition(
  options: BoundedImagePanPositionOptions
): { positionX: number; positionY: number } {
  const {
    contentHeight,
    contentWidth,
    positionX,
    positionY,
    scale,
    wrapperHeight,
    wrapperWidth,
  } = options;
  const scaledContentWidth = contentWidth * scale;
  const scaledContentHeight = contentHeight * scale;
  const centeredPositionX = (wrapperWidth - scaledContentWidth) / 2;
  const centeredPositionY = (wrapperHeight - scaledContentHeight) / 2;
  const minimumX =
    scaledContentWidth > wrapperWidth
      ? wrapperWidth - scaledContentWidth
      : centeredPositionX;
  const maximumX = scaledContentWidth > wrapperWidth ? 0 : centeredPositionX;
  const minimumY =
    scaledContentHeight > wrapperHeight
      ? wrapperHeight - scaledContentHeight
      : centeredPositionY;
  const maximumY = scaledContentHeight > wrapperHeight ? 0 : centeredPositionY;

  return {
    positionX: clampPosition(positionX, minimumX, maximumX),
    positionY: clampPosition(positionY, minimumY, maximumY),
  };
}

export function resolveImageZoomCursor(
  options: ImageZoomCursorOptions
): "grabbing" | "zoom-in" | "zoom-out" {
  const { isDragging, isModifierHeld } = options;

  if (isDragging) {
    return "grabbing";
  }

  return isModifierHeld ? "zoom-out" : "zoom-in";
}
