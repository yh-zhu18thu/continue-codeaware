import { ArrowUturnLeftIcon, ArrowUturnRightIcon, CheckIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { ToolTip } from "../../../components/gui/Tooltip";

interface RequirementEditToolBarProps {
    onUndo: () => void;
    onRedo: () => void;
    onAIProcess: () => void;
    onSubmit: () => void;
    isUndoDisabled: boolean;
    isRedoDisabled: boolean;
    isAIProcessDisabled: boolean;
    isSubmitDisabled: boolean;
}

export default function RequirementEditToolBar({
    onSubmit,
    onUndo,
    onRedo,
    onAIProcess,
    isUndoDisabled,
    isRedoDisabled,
    isSubmitDisabled,
    isAIProcessDisabled,
}: RequirementEditToolBarProps) {
    return (
        <div className="absolute bottom-2 left-4 flex gap-2">
            {/* Undo */}
            <ToolTip text="Undo" position="top">
                <button
                    onClick={onUndo}
                    disabled={isUndoDisabled}
                    className="p-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                    aria-label="Undo"
                >
                    <ArrowUturnLeftIcon className="w-5 h-5" />
                </button>
            </ToolTip>

            {/* Redo */}
            <ToolTip text="Redo" position="top">
                <button
                    onClick={onRedo}
                    disabled={isRedoDisabled}
                    className="p-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                    aria-label="Redo"
                >
                    <ArrowUturnRightIcon className="w-5 h-5" />
                </button>
            </ToolTip>

            {/* AI Process */}
            <ToolTip text="AI Process" position="top">
                <button
                    onClick={onAIProcess}
                    disabled={isAIProcessDisabled}
                    className="p-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
                    aria-label="AI Process"
                >
                    <SparklesIcon className="w-5 h-5" />
                </button>
            </ToolTip>

            {/* Submit */}
            <ToolTip text="Submit" position="top">
                <button
                    onClick={onSubmit}
                    disabled={isSubmitDisabled}
                    className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                    aria-label="Submit"
                >
                    <CheckIcon className="w-5 h-5" />
                </button>
            </ToolTip>
        </div>
    )
}