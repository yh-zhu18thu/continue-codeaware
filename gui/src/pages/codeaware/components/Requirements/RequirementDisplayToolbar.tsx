import { PencilSquareIcon } from "@heroicons/react/24/outline";
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
    // onRegenerate: () => void; // 移除重新生成功能
    disabled?: boolean; // Optional disabled state
}

export default function RequirementDisplayToolBar({
    onEdit,
    // onRegenerate, // 移除重新生成功能
    disabled = false,
}: RequirementDisplayToolBarProps) {
    return (
        <StyledDiv className="find-widget-skip flex"> {/* Added find-widget-skip and flex for consistency */}
            {/* Edit Button */}
            <HoverItem>
                <PencilSquareIcon
                    className={`w-5 h-5 ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-125 cursor-pointer'}`} // Disabled styling
                    onClick={disabled ? undefined : onEdit}
                    aria-label="Edit Requirement"
                >
                    <ToolTip text={disabled ? "代码编辑模式下不可用" : "编辑需求"} position="top">
                        编辑需求
                    </ToolTip>
                </PencilSquareIcon>
            </HoverItem>

            {/* 移除重新生成按钮 */}
        </StyledDiv>
    );
}