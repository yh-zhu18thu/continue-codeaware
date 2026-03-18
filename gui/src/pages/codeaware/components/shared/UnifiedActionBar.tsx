import {
  BookmarkIcon as BookmarkOutlineIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkSolidIcon } from "@heroicons/react/24/solid";
import React from "react";
import styled from "styled-components";

export interface UnifiedActionBarProps {
  onConfusion?: () => void;
  onPin?: () => void;
  isPinned?: boolean;
  disabled?: boolean;
  size?: "sm" | "md";
  layout?: "horizontal" | "vertical";
  /** Hide specific buttons */
  hideConfusion?: boolean;
  hidePin?: boolean;
  /** Loading states for individual buttons */
  confusionLoading?: boolean;
}

const BarContainer = styled.div<{
  $layout: "horizontal" | "vertical";
}>`
  display: flex;
  flex-direction: ${(p) => (p.$layout === "vertical" ? "column" : "row")};
  align-items: center;
  gap: 2px;
`;

const ActionButton = styled.button<{
  $size: "sm" | "md";
  $active?: boolean;
}>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${(p) => (p.$size === "sm" ? "22px" : "26px")};
  height: ${(p) => (p.$size === "sm" ? "22px" : "26px")};
  border: none;
  border-radius: 4px;
  background: ${(p) =>
    p.$active ? "rgba(59, 130, 246, 0.15)" : "transparent"};
  color: ${(p) =>
    p.$active
      ? "var(--vscode-charts-blue, #3b82f6)"
      : "var(--vscode-descriptionForeground)"};
  cursor: pointer;
  transition: all 150ms ease;
  padding: 0;

  &:hover:not(:disabled) {
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
    color: var(--vscode-foreground);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  svg {
    width: ${(p) => (p.$size === "sm" ? "14px" : "16px")};
    height: ${(p) => (p.$size === "sm" ? "14px" : "16px")};
  }
`;

const SmallSpinner = styled.div<{ $size: "sm" | "md" }>`
  width: ${(p) => (p.$size === "sm" ? "12px" : "14px")};
  height: ${(p) => (p.$size === "sm" ? "12px" : "14px")};
  border: 1.5px solid var(--vscode-descriptionForeground);
  border-top-color: var(--vscode-foreground);
  border-radius: 50%;
  animation: uab-spin 0.8s linear infinite;

  @keyframes uab-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

/**
 * Unified 3-button action bar shared across all CodeAware levels.
 *
 * - **困惑** (QuestionMarkCircle): "I'm confused / dig deeper"
 * - **Pin** (Bookmark): "Mark for later review"
 */
export const UnifiedActionBar: React.FC<UnifiedActionBarProps> = ({
  onConfusion,
  onPin,
  isPinned = false,
  disabled = false,
  size = "md",
  layout = "horizontal",
  hideConfusion = false,
  hidePin = false,
  confusionLoading = false,
}) => {
  return (
    <BarContainer $layout={layout}>
      {!hideConfusion && (
        <ActionButton
          $size={size}
          onClick={onConfusion}
          disabled={disabled || confusionLoading}
          title="我有疑惑"
        >
          {confusionLoading ? (
            <SmallSpinner $size={size} />
          ) : (
            <QuestionMarkCircleIcon />
          )}
        </ActionButton>
      )}

      {!hidePin && (
        <ActionButton
          $size={size}
          $active={isPinned}
          onClick={onPin}
          disabled={disabled}
          title={isPinned ? "取消标记" : "标记待学"}
        >
          {isPinned ? <BookmarkSolidIcon /> : <BookmarkOutlineIcon />}
        </ActionButton>
      )}
    </BarContainer>
  );
};

export default UnifiedActionBar;
