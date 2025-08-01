import { ArrowPathIcon, PencilIcon } from "@heroicons/react/24/outline";
import { PencilIcon as PencilIconSolid } from "@heroicons/react/24/solid";
import { useCallback, useState } from "react";
import styled from "styled-components";
import {
  lightGray,
  vscButtonBackground,
  vscButtonForeground,
  vscForeground,
  vscInputBackground,
  vscListActiveBackground
} from "../../../components";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import { selectIsCodeEditModeEnabled, toggleCodeEditMode } from "../../../redux/slices/codeAwareSlice";

const ToggleButton = styled.button<{ isActive: boolean; variant?: 'primary' | 'secondary' }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  border: none;
  background-color: ${props => {
    if (props.variant === 'primary') {
      return props.isActive ? vscButtonBackground : 'transparent';
    }
    return props.isActive ? vscListActiveBackground : 'transparent';
  }};
  color: ${props => {
    if (props.variant === 'primary') {
      return props.isActive ? vscButtonForeground : vscForeground;
    }
    return vscForeground;
  }};
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    background-color: ${props => {
      if (props.variant === 'primary') {
        return props.isActive ? vscButtonBackground : vscInputBackground;
      }
      return props.isActive ? vscListActiveBackground : vscInputBackground;
    }};
    opacity: ${props => props.isActive ? 0.9 : 1};
  }
  
  &:active {
    transform: scale(0.98);
  }
  
  &:focus {
    outline: 1px solid ${vscForeground}40;
    outline-offset: 1px;
  }
  
  svg {
    width: 14px;
    height: 14px;
  }
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 2px;
`;

const TooltipContainer = styled.div`
  position: relative;
  display: inline-block;
`;

const Tooltip = styled.div<{ show: boolean }>`
  position: absolute;
  bottom: -32px;
  left: 50%;
  transform: translateX(-50%);
  background-color: ${vscInputBackground};
  color: ${vscForeground};
  padding: 6px 8px;
  border-radius: 3px;
  font-size: 11px;
  white-space: nowrap;
  visibility: ${props => props.show ? 'visible' : 'hidden'};
  opacity: ${props => props.show ? 1 : 0};
  transition: opacity 0.2s, visibility 0.2s;
  z-index: 1000;
  border: 1px solid ${lightGray}40;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  
  &::before {
    content: '';
    position: absolute;
    top: -4px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-bottom: 4px solid ${vscInputBackground};
  }
`;

interface CodeEditModeToggleProps {
  className?: string;
  onRegenerateSteps?: () => void;
  showRegenerateSteps?: boolean;
}

export default function CodeEditModeToggle({ 
  className, 
  onRegenerateSteps,
  showRegenerateSteps = false 
}: CodeEditModeToggleProps) {
  const dispatch = useAppDispatch();
  const isCodeEditModeEnabled = useAppSelector(selectIsCodeEditModeEnabled);
  const [showEditTooltip, setShowEditTooltip] = useState(false);
  const [showRegenerateTooltip, setShowRegenerateTooltip] = useState(false);
  
  const handleToggle = useCallback(() => {
    dispatch(toggleCodeEditMode());
  }, [dispatch]);

  const handleRegenerateSteps = useCallback(() => {
    if (onRegenerateSteps) {
      onRegenerateSteps();
    }
  }, [onRegenerateSteps]);

  return (
    <ButtonContainer className={className}>
      <TooltipContainer
        onMouseEnter={() => setShowEditTooltip(true)}
        onMouseLeave={() => setShowEditTooltip(false)}
      >
        <ToggleButton
          isActive={isCodeEditModeEnabled}
          onClick={handleToggle}
        >
          {isCodeEditModeEnabled ? <PencilIconSolid /> : <PencilIcon />}
        </ToggleButton>
        <Tooltip show={showEditTooltip}>
          {isCodeEditModeEnabled ? "退出编辑模式" : "进入编辑模式"}
        </Tooltip>
      </TooltipContainer>
      
      {showRegenerateSteps && (
        <TooltipContainer
          onMouseEnter={() => setShowRegenerateTooltip(true)}
          onMouseLeave={() => setShowRegenerateTooltip(false)}
        >
          <ToggleButton 
            isActive={false} 
            variant="primary"
            onClick={handleRegenerateSteps}
          >
            <ArrowPathIcon />
          </ToggleButton>
          <Tooltip show={showRegenerateTooltip}>
            重新编辑需求
          </Tooltip>
        </TooltipContainer>
      )}
    </ButtonContainer>
  );
}
