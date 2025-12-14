import { CheckIcon } from "@heroicons/react/24/outline";
import styled from "styled-components";
import { vscEditorBackground } from "../../../../components";
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
      <div className="align-end flex items-center justify-end gap-2 whitespace-nowrap">
        <HoverItem>
          <ToolTip content="确认修改" place="top">
            <CheckIcon
              className={`h-4 w-4 ${isSubmitDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:brightness-125"}`}
              onClick={!isSubmitDisabled ? onSubmit : undefined}
            />
          </ToolTip>
        </HoverItem>
      </div>
    </StyledDiv>
  );
}
