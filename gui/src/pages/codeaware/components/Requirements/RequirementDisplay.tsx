import { useAppSelector } from "../../../../redux/hooks";
import RequirementDisplayToolBar from "./RequirementDisplayToolbar";
interface RequirementDisplayProps {
    onEdit: () => void;
    onRegenerate: () => void;
}

export default function RequirementDisplay({
    onEdit,
    onRegenerate,
}: RequirementDisplayProps) {
    const requirementText = useAppSelector(
        (state) => state.codeAwareSession.userRequirement?.requirementDescription || ""
    );

    return (
        <div className="relative max-w-2xl mx-auto mt-8 p-4 border rounded-2xl shadow-md bg-white">
            {/* Requirement Content Display */}
            <div
                className="prose max-w-none min-h-[200px] border rounded-md p-4 bg-gray-50"
                style={{ whiteSpace: 'pre-wrap' }} // 保留换行符和空格
            >
                {requirementText}
            </div>

            {/* Tool Bar */}
            <RequirementDisplayToolBar
                onEdit={onEdit}
                onRegenerate={onRegenerate}
            />
        </div>
    );
}