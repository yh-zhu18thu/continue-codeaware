import { ChatBubbleLeftRightIcon, ChevronDownIcon, PlusIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
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
  padding: 4px 16px;
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

const ChevronContainer = styled.div<{ isExpanded: boolean }>`
  display: flex;
  align-items: center;
  transition: transform 0.15s ease-in-out;
  transform: ${({ isExpanded }) => isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'};
`;

const ButtonGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
`;

interface KnowledgeCardToolBarProps {
  title: string;
  isExpanded?: boolean;
  onToggle?: () => void;
  onQuestionClick?: () => void;
  onChatClick?: () => void;
  onAddToCollectionClick?: () => void;
  isQuestionDisabled?: boolean;
  isChatDisabled?: boolean;
  isAddToCollectionDisabled?: boolean;
  isHighlighted?: boolean;
  isFlickering?: boolean;
}

const KnowledgeCardToolBar: React.FC<KnowledgeCardToolBarProps> = ({
  title,
  isExpanded = true,
  onToggle,
  onQuestionClick,
  onChatClick, // use UseNavigate to navigate to the chat page
  onAddToCollectionClick,
  isQuestionDisabled = false,
  isChatDisabled = false,
  isAddToCollectionDisabled = false,
  isHighlighted = false,
  isFlickering = false,
}) => {
  return (
    <ToolBarContainer isHighlighted={isHighlighted} isFlickering={isFlickering}>
      <TitleSection onClick={onToggle}>
        <Title title={title}>
          {title}
        </Title>
        <ChevronContainer isExpanded={isExpanded}>
          <ChevronDownIcon width={16} height={16} />
        </ChevronContainer>
      </TitleSection>

      <ButtonGroup>
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

        <HoverItem>
          <ChatBubbleLeftRightIcon
            className={`w-5 h-5 ${isChatDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-125 cursor-pointer'}`}
            onClick={!isChatDisabled ? onChatClick : undefined}
          >
            <ToolTip text="Discuss more" position="top">
              Discuss more
            </ToolTip>
          </ChatBubbleLeftRightIcon>
        </HoverItem>

        <HoverItem>
          <PlusIcon
            className={`w-5 h-5 ${isAddToCollectionDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-125 cursor-pointer'}`}
            onClick={!isAddToCollectionDisabled ? onAddToCollectionClick : undefined}
          >
            <ToolTip text="Mark as keypoint" position="top">
              Mark as keypoint
            </ToolTip>
          </PlusIcon>
        </HoverItem>
      </ButtonGroup>
    </ToolBarContainer>
  );
};

export default KnowledgeCardToolBar;