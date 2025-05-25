import { ArrowPathIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { ToolTip } from "../../../../components/gui/Tooltip";

interface RequirementDisplayToolBarProps {
    onEdit: () => void;
    onRegenerate: () => void;
}

export default function RequirementDisplayToolBar({
    onEdit,
    onRegenerate,
}: RequirementDisplayToolBarProps) {
    return (
        <div className="absolute bottom-2 left-4 flex gap-2">
            {/* Edit Button */}
            <ToolTip text="编辑需求" position="top">
                <button
                    onClick={onEdit}
                    className="p-2 bg-gray-200 rounded hover:bg-gray-300"
                    aria-label="Edit Requirement"
                >
                    <PencilSquareIcon className="w-5 h-5" />
                </button>
            </ToolTip>

            {/* Regenerate Button */}
            <ToolTip text="重新生成" position="top">
                <button
                    onClick={onRegenerate}
                    className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                    aria-label="Regenerate"
                >
                    <ArrowPathIcon className="w-5 h-5" />
                </button>
            </ToolTip>
        </div>
    );
}