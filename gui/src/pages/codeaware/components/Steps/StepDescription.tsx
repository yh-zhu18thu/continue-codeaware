import React from "react";
import styled from "styled-components";
import {
  defaultBorderRadius,
  vscEditorBackground,
  vscForeground
} from "../../../../components";
import StyledMarkdownPreview from "../../../../components/markdown/StyledMarkdownPreview";


const ContentArea = styled.div`
  min-height: 20px;
  border-radius: ${defaultBorderRadius};
  padding: 0.5rem;
  background-color: ${vscEditorBackground};
  color: ${vscForeground};
  white-space: pre-wrap;
  line-height: 1.6;
  font-size: 12px;
`;

interface StepDescriptionProps {
  markdownContent: string;
  isVisible?: boolean; // Control visibility for collapsing
}

const StepDescription: React.FC<StepDescriptionProps> = ({
  markdownContent,
  isVisible = true,
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="px-1">
      <ContentArea>
        <StyledMarkdownPreview
          source={markdownContent}
          useParentBackgroundColor={true}
        />
      </ContentArea>
    </div>
  );
};

export default StepDescription;