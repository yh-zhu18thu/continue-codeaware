import {
  AcademicCapIcon,
  BookOpenIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { XMarkIcon } from "@heroicons/react/24/solid";
import React from "react";
import styled from "styled-components";
import {
  defaultBorderRadius,
  lightGray,
  vscButtonBackground,
  vscForeground,
} from "../../../../components";
import { ToolTip } from "../../../../components/gui/Tooltip";
import HoverItem from "../../../../components/mainInput/InputToolbar/HoverItem";

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

const DisableButtonContainer = styled.div`
  position: absolute;
  top: 0px;
  left: 0px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
`;

const TitleSection = styled.div`
  display: flex;
  align-items: center;
  flex: 1;
  cursor: pointer;
  min-width: 0; /* Allow text to shrink */
  margin-left: 10px; /* Add space to avoid overlap with the x button */
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

const QuestionButtonContainer = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-right: 8px;
  margin-top: 2px; /* Align with the title */
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

interface KnowledgeCardToolBarProps {
  title: string;
  isExpanded?: boolean;
  onToggle?: () => void;
  onQuestionClick?: () => void;
  onDisableClick?: () => void; // Replace chat and add to collection with disable
  isQuestionDisabled?: boolean;
  isHighlighted?: boolean;
  isFlickering?: boolean;
  isTestMode?: boolean; // 新增：是否在测试模式
  hasCorrectAnswer?: boolean; // 新增：是否有正确答案
  masteryScore?: number | null;
  masteryColor?: string;
}

const KnowledgeCardToolBar: React.FC<KnowledgeCardToolBarProps> = ({
  title,
  isExpanded = true,
  onToggle,
  onQuestionClick,
  onDisableClick,
  isQuestionDisabled = false,
  isHighlighted = false,
  isFlickering = false,
  isTestMode = false, // 新增默认值
  hasCorrectAnswer = false, // 新增默认值
  masteryScore = null,
  masteryColor,
}) => {
  const masteryPercent =
    masteryScore !== null ? Math.round(masteryScore * 100) : null;

  return (
    <ToolBarContainer isHighlighted={isHighlighted} isFlickering={isFlickering}>
      {/* Small disable button in top-left corner */}
      <DisableButtonContainer>
        <HoverItem>
          <ToolTip content="删除不需要的知识卡片" place="top">
            <XMarkIcon
              className="h-3 w-3 cursor-pointer text-white transition-colors hover:text-gray-300"
              onClick={onDisableClick}
            />
          </ToolTip>
        </HoverItem>
      </DisableButtonContainer>

      {/* Title section in the middle */}
      <TitleSection onClick={onToggle}>
        <Title title={title}>{title}</Title>
      </TitleSection>

      {/* Test/Knowledge toggle button */}
      <QuestionButtonContainer>
        <HoverItem>
          {isTestMode ? (
            <ToolTip content="返回知识卡片" place="top">
              <BookOpenIcon
                className={`h-5 w-5 cursor-pointer hover:brightness-125`}
                onClick={onQuestionClick}
              />
            </ToolTip>
          ) : (
            <ToolTip content="查看测试题" place="top">
              <AcademicCapIcon
                className={`h-5 w-5 ${isQuestionDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:brightness-125"} ${hasCorrectAnswer ? "text-green-500" : ""}`}
                onClick={!isQuestionDisabled ? onQuestionClick : undefined}
              />
            </ToolTip>
          )}
        </HoverItem>
      </QuestionButtonContainer>

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
