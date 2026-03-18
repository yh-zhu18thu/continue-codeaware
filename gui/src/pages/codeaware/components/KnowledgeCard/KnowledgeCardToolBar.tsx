import {
  AcademicCapIcon,
  BookmarkIcon as BookmarkOutlineIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkSolidIcon } from "@heroicons/react/24/solid";
import React from "react";
import styled from "styled-components";
import {
  defaultBorderRadius,
  lightGray,
  vscButtonBackground,
  vscForeground,
} from "../../../../components";

const ToolBarContainer = styled.div<{
  isHighlighted?: boolean;
  isFlickering?: boolean;
}>`
  width: 95%;
  padding: 4px 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: ${vscButtonBackground}22; /* Slightly lighter than Step */
  color: ${vscForeground};
  border-bottom: 1px solid
    ${({ isHighlighted, isFlickering }) =>
      isFlickering ? "#ff6b6b" : isHighlighted ? "#4ade80" : `${lightGray}33`};
  transition: border-color 0.15s ease-in-out;
  position: relative;
`;

const TitleSection = styled.div`
  display: flex;
  align-items: center;
  flex: 1;
  cursor: pointer;
  min-width: 0; /* Allow text to shrink */
`;

const Title = styled.span`
  font-weight: 500;
  font-size: 14px;
  color: ${vscForeground};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 8px;
  max-width: 100%; /* Ensure it doesn't overflow */
`;

const ActionButtonsContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  margin-right: 4px;
`;

const ActionBtn = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: ${(p) => (p.$active ? "rgba(59,130,246,0.15)" : "transparent")};
  color: ${(p) =>
    p.$active ? "var(--vscode-charts-blue, #3b82f6)" : "inherit"};
  cursor: pointer;
  transition: all 150ms;
  padding: 0;

  &:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const ChevronContainer = styled.div<{ isExpanded: boolean }>`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  transition: transform 0.15s ease-in-out;
  transform: ${({ isExpanded }) =>
    isExpanded ? "rotate(0deg)" : "rotate(-90deg)"};
`;

const MasteryBackgroundFill = styled.div<{
  percent: number;
  masteryColor: string;
}>`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: ${({ percent }) => percent}%;
  background-color: ${({ masteryColor }) => masteryColor};
  opacity: 0.18;
  border-radius: ${defaultBorderRadius};
  pointer-events: none;
  z-index: 0;
  transition:
    width 0.5s ease-in-out,
    background-color 0.4s ease-in-out;
`;

const SourceTag = styled.span<{ $type: string }>`
  font-size: 9px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
  margin-right: 6px;
  z-index: 1;
  background: ${(p) =>
    p.$type === "prerequisite"
      ? "rgba(59,130,246,0.15)"
      : p.$type === "confusion"
        ? "rgba(245,158,11,0.15)"
        : "rgba(16,185,129,0.15)"};
  color: ${(p) =>
    p.$type === "prerequisite"
      ? "#60a5fa"
      : p.$type === "confusion"
        ? "#fbbf24"
        : "#34d399"};
`;

const SOURCE_LABELS: Record<string, string> = {
  prerequisite: "背景",
  confusion: "提问",
  question: "提问",
};

interface KnowledgeCardToolBarProps {
  title: string;
  isExpanded?: boolean;
  onToggle?: () => void;
  onSelfTest?: () => void;
  onPin?: () => void;
  isPinned?: boolean;
  isHighlighted?: boolean;
  isFlickering?: boolean;
  masteryScore?: number | null;
  masteryColor?: string;
  sourceTag?: "prerequisite" | "confusion" | "question" | null;
}

const KnowledgeCardToolBar: React.FC<KnowledgeCardToolBarProps> = ({
  title,
  isExpanded = true,
  onToggle,
  onSelfTest,
  onPin,
  isPinned = false,
  isHighlighted = false,
  isFlickering = false,
  masteryScore = null,
  masteryColor,
  sourceTag = null,
}) => {
  const masteryPercent =
    masteryScore !== null ? Math.round(masteryScore * 100) : null;

  return (
    <ToolBarContainer isHighlighted={isHighlighted} isFlickering={isFlickering}>
      {/* Title section */}
      <TitleSection onClick={onToggle}>
        {sourceTag && (
          <SourceTag $type={sourceTag}>{SOURCE_LABELS[sourceTag]}</SourceTag>
        )}
        <Title title={title}>{title}</Title>
      </TitleSection>

      {/* Self-test and Pin buttons */}
      <ActionButtonsContainer>
        <ActionBtn
          onClick={(e) => {
            e.stopPropagation();
            onSelfTest?.();
          }}
          title="自我测试"
        >
          <AcademicCapIcon />
        </ActionBtn>
        <ActionBtn
          $active={isPinned}
          onClick={(e) => {
            e.stopPropagation();
            onPin?.();
          }}
          title={isPinned ? "取消标记" : "标记待学"}
        >
          {isPinned ? <BookmarkSolidIcon /> : <BookmarkOutlineIcon />}
        </ActionBtn>
      </ActionButtonsContainer>

      {/* Chevron button on the right */}
      <ChevronContainer isExpanded={isExpanded} onClick={onToggle}>
        <ChevronDownIcon width={16} height={16} />
      </ChevronContainer>

      {/* Mastery background fill */}
      {masteryColor && masteryPercent !== null && (
        <MasteryBackgroundFill
          percent={masteryPercent}
          masteryColor={masteryColor}
        />
      )}
    </ToolBarContainer>
  );
};

export default KnowledgeCardToolBar;
