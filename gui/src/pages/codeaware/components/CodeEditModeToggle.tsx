import { PencilIcon } from "@heroicons/react/24/outline";
import { PencilIcon as PencilIconSolid } from "@heroicons/react/24/solid";
import { useCallback } from "react";
import styled from "styled-components";
import { defaultBorderRadius, lightGray, vscForeground } from "../../../components";
import { useAppDispatch, useAppSelector } from "../../../redux/hooks";
import { selectIsCodeEditModeEnabled, toggleCodeEditMode } from "../../../redux/slices/codeAwareSlice";

const ToggleButton = styled.button<{ isActive: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: ${defaultBorderRadius};
  border: 1px solid ${props => props.isActive ? vscForeground : lightGray};
  background-color: ${props => props.isActive ? vscForeground : 'transparent'};
  color: ${props => props.isActive ? 'black' : vscForeground};
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background-color: ${props => props.isActive ? vscForeground : lightGray};
    opacity: 0.8;
  }
  
  &:active {
    transform: scale(0.95);
  }
  
  svg {
    width: 16px;
    height: 16px;
  }
`;

const TooltipContainer = styled.div`
  position: relative;
  display: inline-block;
`;

const Tooltip = styled.div<{ show: boolean }>`
  position: absolute;
  bottom: -35px;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  visibility: ${props => props.show ? 'visible' : 'hidden'};
  opacity: ${props => props.show ? 1 : 0};
  transition: opacity 0.2s, visibility 0.2s;
  z-index: 1000;
  
  &::before {
    content: '';
    position: absolute;
    top: -4px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-bottom: 4px solid rgba(0, 0, 0, 0.8);
  }
`;

interface CodeEditModeToggleProps {
  className?: string;
}

export default function CodeEditModeToggle({ className }: CodeEditModeToggleProps) {
  const dispatch = useAppDispatch();
  const isCodeEditModeEnabled = useAppSelector(selectIsCodeEditModeEnabled);
  
  const handleToggle = useCallback(() => {
    dispatch(toggleCodeEditMode());
  }, [dispatch]);

  return (
    <TooltipContainer className={className}>
      <ToggleButton
        isActive={isCodeEditModeEnabled}
        onClick={handleToggle}
        data-tooltip-content={isCodeEditModeEnabled ? "切换到 CodeAware 模式" : "切换到代码编辑模式"}
      >
        {isCodeEditModeEnabled ? (
          <PencilIconSolid />
        ) : (
          <PencilIcon />
        )}
      </ToggleButton>
      <Tooltip show={false}>
        {isCodeEditModeEnabled ? "切换到 CodeAware 模式" : "切换到代码编辑模式"}
      </Tooltip>
    </TooltipContainer>
  );
}
