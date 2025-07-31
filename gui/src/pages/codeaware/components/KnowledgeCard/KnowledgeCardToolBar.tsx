import { ChevronDownIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { XMarkIcon } from '@heroicons/react/24/solid';
import React from 'react';
import styled from "styled-components";
import {
  lightGray,
  vscButtonBackground,
  vscForeground
} from "../../../../components";
import { ToolTip } from '../../../../components/gui/Tooltip';
import HoverItem from '../../../../components/mainInput/InputToolbar/HoverItem';

const ToolBarContainer = styled.div<{ isHighlighted?: boolean; isFlickering?: boolean }>`
  width: 95%;
  padding: 4px 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: ${vscButtonBackground}22; /* Slightly lighter than Step */
  color: ${vscForeground};
  border-bottom: 1px solid ${({ isHighlighted, isFlickering }) => 
    isFlickering ? '#ff6b6b' : 
    isHighlighted ? '#4ade80' : 
    `${lightGray}33`};
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
  transform: ${({ isExpanded }) => isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'};
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
}) => {
  return (
    <ToolBarContainer isHighlighted={isHighlighted} isFlickering={isFlickering}>
      {/* Small disable button in top-left corner */}
      <DisableButtonContainer>
        <HoverItem>
          <XMarkIcon
            className="w-3 h-3 cursor-pointer text-white hover:text-gray-300 transition-colors"
            onClick={onDisableClick}
          />
          <ToolTip text="删除不需要的知识卡片" position="top">
            删除不需要的知识卡片
          </ToolTip>
        </HoverItem>
      </DisableButtonContainer>

      {/* Title section in the middle */}
      <TitleSection onClick={onToggle}>
        <Title title={title}>
          {title}
        </Title>
      </TitleSection>

      {/* Question button */}
      <QuestionButtonContainer>
        <HoverItem>
          <QuestionMarkCircleIcon
            className={`w-5 h-5 ${isQuestionDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-125 cursor-pointer'}`}
            onClick={!isQuestionDisabled ? onQuestionClick : undefined}
          >
            <ToolTip text="Test Your Mastery" position="top">
              Test Your Mastery
            </ToolTip>
          </QuestionMarkCircleIcon>
        </HoverItem>
      </QuestionButtonContainer>

      {/* Chevron button on the right */}
      <ChevronContainer isExpanded={isExpanded} onClick={onToggle}>
        <ChevronDownIcon width={16} height={16} />
      </ChevronContainer>
    </ToolBarContainer>
  );
};

export default KnowledgeCardToolBar;