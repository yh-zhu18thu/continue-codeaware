import { ArrowPathIcon, ChevronDownIcon, PlayIcon } from '@heroicons/react/24/outline';
import { StepStatus } from "core";
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
  stepStatus?: StepStatus;
  isViewed?: boolean;
}>`
  padding: 4px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${({ isActive }) => 
    isActive ? vscListActiveBackground : vscInputBackground
  };
  color: ${({ stepStatus }) => {
    // Special text colors for dirty states to make them stand out
    if (stepStatus === "step_dirty") return '#FCD34D'; // Bright amber text for step dirty
    if (stepStatus === "code_dirty") return '#FB923C'; // Bright orange text for code dirty
    return vscForeground;
  }};
  cursor: pointer;
  transition: background-color 0.15s ease-in-out, border-color 0.15s ease-in-out, opacity 0.15s ease-in-out;
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
  // Different opacity for different states
  opacity: ${({ stepStatus, isViewed }) => {
    if (stepStatus === "generating") return 0.85; // Slightly dimmed when generating
    if (stepStatus === "generated") return 0.7; // More dimmed when generated but not confirmed
    if (!isViewed) return 0.8; // 未查看过的步骤稍微透明
    return 1; // Full opacity for confirmed and dirty states
  }};
  animation: ${({ isFlickering }) => 
    isFlickering ? 'none' : 'none'
  }; // Remove any conflicting animations

  &:hover {
    background-color: ${vscInputBackground};
    color: ${({ stepStatus }) => {
      // Maintain bright text colors on hover for dirty states
      if (stepStatus === "step_dirty") return '#FDE68A'; // Even brighter amber on hover
      if (stepStatus === "code_dirty") return '#FED7AA'; // Even brighter orange on hover
      return vscForeground;
    }};
  }
`;

const TitleContent = styled.div<{ isViewed?: boolean }>`
  display: flex;
  align-items: center;
  flex: 1;
  font-weight: ${({ isViewed }) => isViewed ? '400' : '500'}; // 查看过的稍微减轻字重
`;

const ViewedIndicator = styled.div<{ isViewed: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: ${({ isViewed }) => isViewed ? '#22C55E' : 'transparent'};
  border: 1px solid ${({ isViewed }) => isViewed ? '#22C55E' : '#666666'};
  margin-right: 8px;
  transition: all 0.2s ease-in-out;
`;

const HighLevelStepBadge = styled.span<{ stepStatus?: StepStatus }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background-color: ${({ stepStatus }) => {
    // Match the RequirementDisplay step icon colors
    if (stepStatus === "step_dirty") return '#FCD34D'; // Bright amber for step dirty
    if (stepStatus === "code_dirty") return '#FB923C'; // Bright orange for code dirty
    return '#888888'; // Default gray
  }};
  color: #ffffff;
  border-radius: 6px;
  font-size: 11px;
  font-weight: bold;
  margin-right: 8px;
  min-width: 20px;
  transition: background-color 0.15s ease-in-out;
`;

const ChevronContainer = styled.div<{ isExpanded: boolean }>`
  display: flex;
  align-items: center;
  transition: transform 0.15s ease-in-out;
  transform: ${({ isExpanded }) => isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'};
`;

const IconContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const IconButton = styled.button<{ disabled?: boolean; stepStatus?: StepStatus }>`
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: ${({ disabled, stepStatus }) => {
    if (disabled) {
      if (stepStatus === "generating") return 'rgba(255, 255, 255, 0.4)'; // Slightly less dimmed for generating
      if (stepStatus === "generated") return 'rgba(255, 255, 255, 0.3)'; // More dimmed for generated
      return 'rgba(255, 255, 255, 0.4)';
    }
    return vscForeground;
  }};
  cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.15s ease-in-out;

  &:hover {
    background-color: ${({ disabled }) => disabled ? 'transparent' : 'rgba(255, 255, 255, 0.1)'};
  }

  &:active {
    background-color: ${({ disabled }) => disabled ? 'transparent' : 'rgba(255, 255, 255, 0.2)'};
  }
`;

interface StepTitleBarProps {
  title: string;
  highLevelStepIndex?: number | null; // 高级步骤序号，从1开始
  isActive?: boolean; // Optional prop to indicate if the step is active
  isExpanded?: boolean; // Optional prop to indicate if the step is expanded
  isHighlighted?: boolean; // Optional prop to indicate if the step is highlighted
  isFlickering?: boolean; // Optional prop to indicate if the step is flickering
  stepStatus?: StepStatus; // Add step status to control button availability
  isViewed?: boolean; // 新增：是否已查看过
  onToggle?: () => void; // Optional callback for toggle functionality
  onExecuteUntilStep?: () => void; // Optional callback for execute until step
  onRerunStep?: () => void; // Optional callback for rerun step when dirty
  disabled?: boolean; // Optional disabled state for code edit mode
}

const StepTitleBar: React.FC<StepTitleBarProps> = ({ 
  title, 
  highLevelStepIndex = null,
  isActive = false, 
  isExpanded = true,
  isHighlighted = false,
  isFlickering = false,
  stepStatus = "confirmed",
  isViewed = false,
  onToggle,
  onExecuteUntilStep,
  onRerunStep,
  disabled = false,
}) => {
  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (disabled) {
      console.warn("⚠️ Step execution is disabled in code edit mode");
      return;
    }
    
    if (stepStatus === "step_dirty") {
      // 如果状态是step_dirty，执行重新运行逻辑
      if (onRerunStep) {
        onRerunStep();
      }
    } else {
      // 否则执行正常的执行逻辑
      if (stepStatus !== "generating" && stepStatus !== "generated" && onExecuteUntilStep) {
        onExecuteUntilStep();
      }
    }
  };

  const isButtonDisabled = stepStatus === "generating" || stepStatus === "generated" || disabled;
  const isStepDirty = stepStatus === "step_dirty";

  // Tooltip text based on step status
  const getTooltipText = () => {
    if (disabled) return "Disabled in code edit mode";
    if (stepStatus === "generating") return "Generating Code...";
    if (stepStatus === "generated") return "Code Generated - Confirm to Proceed";
    if (isStepDirty) return "Rerun Step";
    return "Execute Until This Step";
  };

  return (
    <TitleBarContainer 
      isActive={isActive} 
      isExpanded={isExpanded}
      isHighlighted={isHighlighted}
      isFlickering={isFlickering}
      stepStatus={stepStatus}
      isViewed={isViewed}
      onClick={onToggle}
    >
      <TitleContent isViewed={isViewed}>
        <ViewedIndicator isViewed={isViewed} />
        {highLevelStepIndex && (
          <HighLevelStepBadge stepStatus={stepStatus}>
            {highLevelStepIndex}
          </HighLevelStepBadge>
        )}
        <span>{title}</span>
      </TitleContent>
      <IconContainer>
        <IconButton 
          onClick={handleButtonClick} 
          disabled={isButtonDisabled}
          stepStatus={stepStatus}
          title={getTooltipText()}
        >
          {isStepDirty ? (
            <ArrowPathIcon width={16} height={16} />
          ) : (
            <PlayIcon width={16} height={16} />
          )}
        </IconButton>
        <ChevronContainer isExpanded={isExpanded}>
          <ChevronDownIcon width={16} height={16} />
        </ChevronContainer>
      </IconContainer>
    </TitleBarContainer>
  );
};

export default StepTitleBar;