import { ChevronDownIcon } from '@heroicons/react/24/outline';
import React from 'react';
import styled from "styled-components";
import {
  defaultBorderRadius,
  lightGray,
  vscForeground,
  vscInputBackground,
  vscListActiveBackground
} from "../../../../components";

const TitleBarContainer = styled.div<{ isActive: boolean; isExpanded: boolean }>`
  padding: 4px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${({ isActive }) => 
    isActive ? vscListActiveBackground : vscInputBackground
  };
  color: ${vscForeground};
  cursor: pointer;
  transition: background-color 0.15s ease-in-out;
  border-radius: ${defaultBorderRadius};
  border: 1px solid ${lightGray}33;
  margin: 4px;
  font-size: 14px;
  font-weight: 500;

  &:hover {
    background-color: ${vscInputBackground};
  }
`;

const TitleContent = styled.div`
  display: flex;
  align-items: center;
  flex: 1;
`;

const ChevronContainer = styled.div<{ isExpanded: boolean }>`
  display: flex;
  align-items: center;
  transition: transform 0.15s ease-in-out;
  transform: ${({ isExpanded }) => isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'};
`;

interface StepTitleBarProps {
  title: string;
  isActive?: boolean; // Optional prop to indicate if the step is active
  isExpanded?: boolean; // Optional prop to indicate if the step is expanded
  onToggle?: () => void; // Optional callback for toggle functionality
}

const StepTitleBar: React.FC<StepTitleBarProps> = ({ 
  title, 
  isActive = false, 
  isExpanded = true,
  onToggle 
}) => {
  return (
    <TitleBarContainer 
      isActive={isActive} 
      isExpanded={isExpanded}
      onClick={onToggle}
    >
      <TitleContent>
        <span>{title}</span>
      </TitleContent>
      <ChevronContainer isExpanded={isExpanded}>
        <ChevronDownIcon width={16} height={16} />
      </ChevronContainer>
    </TitleBarContainer>
  );
};

export default StepTitleBar;