import styled from "styled-components";
import {
    defaultBorderRadius,
    vscBackground,
    vscCommandCenterInactiveBorder,
    vscForeground
} from "../../../../components";
import { useAppSelector } from "../../../../redux/hooks";
import RequirementDisplayToolBar from "./RequirementDisplayToolbar";

const DisplayContainerDiv = styled.div<{}>`
  resize: none;
  padding-bottom: 4px;
  font-family: inherit;
  border-radius: ${defaultBorderRadius};
  margin: 12px;
  height: auto;
  background-color: ${vscBackground}; // 使用更深的背景色
  color: ${vscForeground};

  transition: border-color 0.15s ease-in-out;

  outline: none;
  font-size: 14px;

  display: flex;
  flex-direction: column;
  max-width: 672px; // 相当于 max-w-2xl
  margin-left: auto;
  margin-right: auto;
  margin-top: 1rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
`;

const ContentDisplayDiv = styled.div<{}>`
  max-width: none;
  min-height: 10px;
  border: 1px solid ${vscCommandCenterInactiveBorder};
  border-radius: ${defaultBorderRadius};
  padding: 1rem 1rem 0.25rem 1rem; // Reduced bottom padding from 1rem to 0.5rem
  background-color: ${vscBackground}; // 使用更深的背景色
  color: ${vscForeground};
  white-space: pre-wrap; // 保留换行符和空格
  line-height: 1.6;
  font-size: 14px;
`;

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
        <DisplayContainerDiv>
            {/* Requirement Content Display */}
            <div className="px-2.5 pb-1 pt-2">
                <ContentDisplayDiv>
                    {requirementText}
                    {/* Tool Bar */}
                    <RequirementDisplayToolBar
                        onEdit={onEdit}
                        onRegenerate={onRegenerate}
                    />
                </ContentDisplayDiv>
            </div>
        </DisplayContainerDiv>
    );
}