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

const TitleBarContainer = styled.div<{ 
  isActive: boolean; 
  isExpanded: boolean; 
  isHighlighted: boolean; 
  isFlickering: boolean; 
}>`
  padding: 4px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${({ isActive }) => 
    isActive ? vscListActiveBackground : vscInputBackground
  };
  color: ${vscForeground};
  cursor: pointer;
  transition: background-color 0.15s ease-in-out, border-color 0.15s ease-in-out;
  border-radius: ${defaultBorderRadius};
  border: 2px solid ${({ isHighlighted, isFlickering }) => {
    if (isFlickering) return '#FFD700'; // Gold color for flickering
    if (isHighlighted) return '#007ACC'; // Bright blue for highlighted
    return `${lightGray}33`; // Default light gray
  }};
  margin: 4px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: ${({ isHighlighted, isFlickering }) => {
    if (isFlickering) return '0 0 12px rgba(255, 215, 0, 0.8)'; // Stronger gold glow for flickering
    if (isHighlighted) return '0 0 8px rgba(0, 122, 204, 0.4)'; // Blue glow for highlighted
    return 'none';
  }};
  animation: ${({ isFlickering }) => 
    isFlickering ? 'none' : 'none'
  }; // Remove any conflicting animations

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
  isHighlighted?: boolean; // Optional prop to indicate if the step is highlighted
  isFlickering?: boolean; // Optional prop to indicate if the step is flickering
  onToggle?: () => void; // Optional callback for toggle functionality
}

const StepTitleBar: React.FC<StepTitleBarProps> = ({ 
  title, 
  isActive = false, 
  isExpanded = true,
  isHighlighted = false,
  isFlickering = false,
  onToggle 
}) => {
  return (
    <TitleBarContainer 
      isActive={isActive} 
      isExpanded={isExpanded}
      isHighlighted={isHighlighted}
      isFlickering={isFlickering}
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