export type PresenceHitTestPoint = {
  x: number;
  y: number;
};

export type PresenceHitTestRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PresenceAvatarSilhouette = {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
};

const avatarVisibleSilhouette: PresenceAvatarSilhouette[] = [
  { centerX: 0.5, centerY: 0.16, radiusX: 0.18, radiusY: 0.14 },
  { centerX: 0.2, centerY: 0.14, radiusX: 0.08, radiusY: 0.1 },
  { centerX: 0.8, centerY: 0.14, radiusX: 0.08, radiusY: 0.1 },
  { centerX: 0.24, centerY: 0.28, radiusX: 0.08, radiusY: 0.2 },
  { centerX: 0.76, centerY: 0.28, radiusX: 0.08, radiusY: 0.2 },
  { centerX: 0.5, centerY: 0.38, radiusX: 0.21, radiusY: 0.24 },
  { centerX: 0.34, centerY: 0.44, radiusX: 0.1, radiusY: 0.24 },
  { centerX: 0.66, centerY: 0.44, radiusX: 0.1, radiusY: 0.24 },
  { centerX: 0.43, centerY: 0.72, radiusX: 0.08, radiusY: 0.24 },
  { centerX: 0.57, centerY: 0.72, radiusX: 0.08, radiusY: 0.24 },
];

function isFiniteRect(
  rect: PresenceHitTestRect | null | undefined,
): rect is PresenceHitTestRect {
  return (
    !!rect &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

export function isPointInsideRect(
  point: PresenceHitTestPoint,
  rect: PresenceHitTestRect | null | undefined,
  padding = 0,
) {
  if (!isFiniteRect(rect)) {
    return false;
  }

  return (
    point.x >= rect.left - padding &&
    point.x <= rect.left + rect.width + padding &&
    point.y >= rect.top - padding &&
    point.y <= rect.top + rect.height + padding
  );
}

function isPointInsideUnitEllipse(
  x: number,
  y: number,
  ellipse: PresenceAvatarSilhouette,
) {
  const normalizedX = (x - ellipse.centerX) / ellipse.radiusX;
  const normalizedY = (y - ellipse.centerY) / ellipse.radiusY;

  return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
}

export function isPointInsideAvatarVisibleHitArea(
  point: PresenceHitTestPoint,
  avatarRect: PresenceHitTestRect | null | undefined,
) {
  if (!isFiniteRect(avatarRect)) {
    return false;
  }

  const normalizedX = (point.x - avatarRect.left) / avatarRect.width;
  const normalizedY = (point.y - avatarRect.top) / avatarRect.height;

  return avatarVisibleSilhouette.some((ellipse) =>
    isPointInsideUnitEllipse(normalizedX, normalizedY, ellipse),
  );
}

export function shouldCapturePresenceCursor({
  point,
  avatarRect,
  capturedElementRect,
  isPresenceDraggable = false,
}: {
  point: PresenceHitTestPoint;
  avatarRect?: PresenceHitTestRect | null;
  capturedElementRect?: PresenceHitTestRect | null;
  isPresenceDraggable?: boolean;
}) {
  if (isPointInsideRect(point, capturedElementRect, 4)) {
    return true;
  }

  if (isPresenceDraggable) {
    return isPointInsideRect(point, avatarRect);
  }

  return isPointInsideAvatarVisibleHitArea(point, avatarRect);
}
