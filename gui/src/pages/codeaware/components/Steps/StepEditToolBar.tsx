import { CheckIcon } from "@heroicons/react/24/outline";
import styled from "styled-components";
import {
    vscEditorBackground
} from "../../../../components";
import { ToolTip } from "../../../../components/gui/Tooltip";
import HoverItem from "../../../../components/mainInput/InputToolbar/HoverItem";

const StyledDiv = styled.div`
  padding-top: 4px;
  justify-content: flex-end;
  gap: 1px;
  background-color: ${vscEditorBackground};
  align-items: end;
  font-size: 12px;
  cursor: default;
  opacity: 1;
  pointer-events: auto;
  user-select: none;
  & > * {
    flex: 0 0 auto;
  }
`;

interface StepEditToolBarProps {
    onSubmit: () => void;
    isSubmitDisabled: boolean;
}

export default function StepEditToolBar({
    onSubmit,
    isSubmitDisabled,
}: StepEditToolBarProps) {
    return (
        <StyledDiv className="find-widget-skip flex">   
            <div className="flex items-center justify-end gap-2 whitespace-nowrap align-end">
                <HoverItem>
                    <CheckIcon
                        className={`w-4 h-4 ${isSubmitDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-125 cursor-pointer'}`}
                        onClick={!isSubmitDisabled ? onSubmit : undefined}
                    >
                        <ToolTip text="确认修改" position="top">
                            确认修改
                        </ToolTip>
                    </CheckIcon>
                </HoverItem>
            </div>
        </StyledDiv>
    );
}
