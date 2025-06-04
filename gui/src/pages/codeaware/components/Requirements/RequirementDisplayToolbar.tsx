import { ArrowPathIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import styled from "styled-components";
import { ToolTip } from "../../../../components/gui/Tooltip";
import HoverItem from "../../../../components/mainInput/InputToolbar/HoverItem";

// Define a styled div, similar to RequirementEditToolBar
// Keeping relevant positioning and styling from the original RequirementDisplayToolbar
const StyledDiv = styled.div`
  justify-content: flex-end; // Changed from space-between to flex-end
  bottom: 0.25rem; // Reduced from 0.5rem to narrow the gap
  left: 1rem; // Corresponds to left-4
  display: flex;
  gap: 0.5rem; // Corresponds to gap-2
  padding-top: 2px; // Reduced from 4px to narrow the gap
  background-color: transparent; // Keeping it transparent as per the original
  align-items: end; // Align items vertically
  font-size: 12px; // From RequirementEditToolBar
  cursor: default;
  opacity: 1;
  pointer-events: auto;
  user-select: none;
  & > * {
    flex: 0 0 auto;
  }
`;

interface RequirementDisplayToolBarProps {
    onEdit: () => void;
    onRegenerate: () => void;
}

export default function RequirementDisplayToolBar({
    onEdit,
    onRegenerate,
}: RequirementDisplayToolBarProps) {
    return (
        <StyledDiv className="find-widget-skip flex"> {/* Added find-widget-skip and flex for consistency */}
            {/* Edit Button */}
            <HoverItem>
                <PencilSquareIcon
                    className="w-5 h-5 hover:brightness-125 cursor-pointer" // Adjusted classes
                    onClick={onEdit}
                    aria-label="Edit Requirement"
                >
                    <ToolTip text="编辑需求" position="top">
                        编辑需求
                    </ToolTip>
                </PencilSquareIcon>
            </HoverItem>

            {/* Regenerate Button */}
            <HoverItem>
                <ArrowPathIcon
                    className="w-5 h-5 hover:brightness-125 cursor-pointer"
                    onClick={onRegenerate}
                    aria-label="Regenerate"
                >
                    <ToolTip text="重新生成" position="top">
                        重新生成
                    </ToolTip>
                </ArrowPathIcon>
            </HoverItem>
        </StyledDiv>
    );
}