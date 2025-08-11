import { ArrowUturnLeftIcon, ArrowUturnRightIcon, CheckIcon } from "@heroicons/react/24/outline";
import styled from "styled-components";
import {
    vscInputBackground
} from "../../../../components";
import { ToolTip } from "../../../../components/gui/Tooltip";
import HoverItem from "../../../../components/mainInput/InputToolbar/HoverItem";

const StyledDiv = styled.div<{ isHidden?: boolean }>`
  padding-top: 4px;
  justify-content: flex-end; // Changed from space-between to flex-end
  gap: 1px;
  background-color: ${vscInputBackground};
  align-items: end;
  font-size: 12 px;
  cursor: default;
  opacity: 1;
  pointer-events: auto;
  user-select: none;
  & > * {
    flex: 0 0 auto;
  }
`;


interface RequirementEditToolBarProps {
    onUndo: () => void;
    onRedo: () => void;
    onSubmit: () => void;
    isUndoDisabled: boolean;
    isRedoDisabled: boolean;
    isSubmitDisabled: boolean;
}

export default function RequirementEditToolBar({
    onSubmit,
    onUndo,
    onRedo,
    isUndoDisabled,
    isRedoDisabled,
    isSubmitDisabled,
}: RequirementEditToolBarProps) {
    return (
    
        <StyledDiv
            className="find-widget-skip flex"
        >   
            <div className="flex items-center justify-start gap-2 whitespace-nowrap align-end">
                <HoverItem>
                    <ArrowUturnLeftIcon 
                        className={`w-4 h-4 ${isUndoDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-125 cursor-pointer'}`}
                        onClick={!isUndoDisabled ? onUndo : undefined}
                    >
                        <ToolTip text="Undo" position="top">
                            Undo
                        </ToolTip>
                    </ArrowUturnLeftIcon>
                </HoverItem>

                {/* Redo */}
                <HoverItem>
                    <ArrowUturnRightIcon
                        className={`w-4 h-4 ${isRedoDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-125 cursor-pointer'}`}
                        onClick={!isRedoDisabled ? onRedo : undefined}
                    >
                        <ToolTip text="Redo" position="top">
                            Redo
                        </ToolTip>
                    </ArrowUturnRightIcon>
                </HoverItem>

                {/* Submit */}
                <HoverItem>
                    <CheckIcon
                        className={`w-4 h-4 ${isSubmitDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-125 cursor-pointer'}`}
                        onClick={!isSubmitDisabled ? onSubmit : undefined}
                    >
                        <ToolTip text={
                            isSubmitDisabled ? "请先输入内容" : "确认需求"
                        } position="top">
                            Submit
                        </ToolTip>
                    </CheckIcon>
                </HoverItem>
            </div>
        </StyledDiv>
    )
}