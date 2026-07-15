export type DockedPresentationSizeRequest = Readonly<{
  workAreaWidth: number;
  workAreaHeight: number;
  masterWidth: number;
  gap: number;
  controlHeight: number;
  nativeFrameBudget: number;
  preferredContentWidth?: number;
}>;

export type DockedPresentationSize = Readonly<{
  playerAreaWidth: number;
  contentWidth: number;
  contentHeight: number;
  estimatedOuterHeight: number;
  estimatedGroupHeight: number;
}>;

export const calculateInitialDockedPresentationSize = ({
  workAreaWidth,
  workAreaHeight,
  masterWidth,
  gap,
  controlHeight,
  nativeFrameBudget,
  preferredContentWidth = Number.MAX_SAFE_INTEGER,
}: DockedPresentationSizeRequest): DockedPresentationSize => {
  const playerAreaWidth = Math.max(1, workAreaWidth - masterWidth - gap);
  const maximumContentHeight = Math.max(
    1,
    workAreaHeight - controlHeight - nativeFrameBudget,
  );
  const contentWidth = Math.max(
    1,
    Math.min(
      playerAreaWidth,
      Math.floor(maximumContentHeight * (16 / 9)),
      preferredContentWidth,
    ),
  );
  const contentHeight = Math.round(contentWidth * (9 / 16));
  const estimatedOuterHeight = contentHeight + nativeFrameBudget;
  return {
    playerAreaWidth,
    contentWidth,
    contentHeight,
    estimatedOuterHeight,
    estimatedGroupHeight: estimatedOuterHeight + controlHeight,
  };
};

export type ProportionalDockedSizeRequest = Readonly<{
  requestedContentWidth: number;
  currentContentWidth: number;
  currentControlHeight: number;
  availableContentWidth: number;
  workAreaHeight: number;
  frameHeight: number;
  topInset: number;
  dockOverlap: number;
  minimumContentWidth: number;
  minimumControlHeight: number;
  maximumControlHeight: number;
  scaleControlHeight: boolean;
}>;

export type ProportionalDockedSize = Readonly<{
  contentWidth: number;
  contentHeight: number;
  controlHeight: number;
  minimumContentWidth: number;
  maximumContentWidth: number;
}>;

const presentationHeightForWidth = (contentWidth: number) =>
  Math.round(contentWidth * (9 / 16));

/**
 * Scales the presentation and its docked controls as one unit. All dimensions
 * are expressed in display-independent pixels, which is also what Electron's
 * screen and BrowserWindow APIs use across monitors with different DPI scales.
 */
export const calculateProportionalDockedSize = ({
  requestedContentWidth,
  currentContentWidth,
  currentControlHeight,
  availableContentWidth,
  workAreaHeight,
  frameHeight,
  topInset,
  dockOverlap,
  minimumContentWidth,
  minimumControlHeight,
  maximumControlHeight,
  scaleControlHeight,
}: ProportionalDockedSizeRequest): ProportionalDockedSize => {
  const safeCurrentWidth = Math.max(1, currentContentWidth);
  const safeAvailableWidth = Math.max(1, Math.floor(availableContentWidth));
  const safeWorkAreaHeight = Math.max(1, Math.floor(workAreaHeight));
  const controlRatio = Math.max(0, currentControlHeight) / safeCurrentWidth;
  const controlHeightForWidth = (contentWidth: number) => scaleControlHeight
    ? Math.max(
        minimumControlHeight,
        Math.min(maximumControlHeight, Math.round(contentWidth * controlRatio)),
      )
    : Math.round(currentControlHeight);
  const fitsAvailableHeight = (contentWidth: number) => {
    const contentHeight = presentationHeightForWidth(contentWidth);
    const controlHeight = controlHeightForWidth(contentWidth);
    return (
      contentHeight + frameHeight <= safeWorkAreaHeight &&
      topInset + contentHeight - dockOverlap + controlHeight <= safeWorkAreaHeight
    );
  };

  // The panel has a real visual floor: below it, rows would be clipped. A
  // binary search handles the min/max panel clamps without assuming that its
  // height always remains a simple ratio of the presentation width.
  let lowerWidth = 1;
  let upperWidth = safeAvailableWidth;
  let maximumWidth = 1;
  while (lowerWidth <= upperWidth) {
    const candidate = Math.floor((lowerWidth + upperWidth) / 2);
    if (fitsAvailableHeight(candidate)) {
      maximumWidth = candidate;
      lowerWidth = candidate + 1;
    } else {
      upperWidth = candidate - 1;
    }
  }
  const effectiveMinimumWidth = Math.min(
    maximumWidth,
    Math.max(1, minimumContentWidth),
  );
  const contentWidth = Math.max(
    effectiveMinimumWidth,
    Math.min(maximumWidth, Math.round(requestedContentWidth)),
  );
  const controlHeight = controlHeightForWidth(contentWidth);

  return {
    contentWidth,
    contentHeight: presentationHeightForWidth(contentWidth),
    controlHeight,
    minimumContentWidth: Math.min(effectiveMinimumWidth, maximumWidth),
    maximumContentWidth: maximumWidth,
  };
};
