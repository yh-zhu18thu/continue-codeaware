import { WrenchIcon } from '@heroicons/react/24/outline';
import React from "react";
import styled from "styled-components";
import {
  defaultBorderRadius,
  vscEditorBackground,
  vscForeground
} from "../../../../components";
import StyledMarkdownPreview from "../../../../components/markdown/StyledMarkdownPreview";

const ContentArea = styled.div`
  border-radius: ${defaultBorderRadius};
  padding: 0.5rem;
  background-color: ${vscEditorBackground};
  color: ${vscForeground};
  font-size: 12px;
  position: relative;
`;

const EditButton = styled.button`
  position: relative;
  color: ${vscForeground};
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background-color 0.15s ease-in-out;
  opacity: 0.7;
  align-self: flex-end;
  margin-top: 4px;

  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
    opacity: 1;
  }

  &:active {
    background-color: rgba(255, 255, 255, 0.2);
  }
`;

interface StepDescriptionProps {
  markdownContent: string;
  isVisible?: boolean; // Control visibility for collapsing
  onEdit?: () => void; // Callback for edit functionality
}

const StepDescription: React.FC<StepDescriptionProps> = ({
  markdownContent,
  isVisible = true,
  onEdit,
}) => {
  if (!isVisible) {
    return null;
  }

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.();
  };

  return (
    <div className="px-1 flex flex-col">
      <ContentArea>
        <StyledMarkdownPreview
          source={markdownContent}
          useParentBackgroundColor={true}
        />
      </ContentArea>
      {onEdit && (
        <div className="flex justify-end">
          <EditButton onClick={handleEditClick} title="修改此步骤">
            <WrenchIcon width={16} height={16} />
          </EditButton>
        </div>
      )}
    </div>
  );
};

export default StepDescription;