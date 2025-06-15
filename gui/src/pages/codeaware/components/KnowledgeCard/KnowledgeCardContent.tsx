import React from 'react';
import styled from "styled-components";
import {
  defaultBorderRadius,
  vscEditorBackground,
  vscForeground
} from "../../../../components";
import StyledMarkdownPreview from "../../../../components/markdown/StyledMarkdownPreview";

const ContentWrapper = styled.div`
  width: 100%;
  background-color: ${vscEditorBackground};
  color: ${vscForeground};
  padding: 4px;
  border-radius: ${defaultBorderRadius};
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  margin: 4px 0;
  font-size: 12px;
  
  /* Center any block elements within the markdown content */
  & > * {
    margin-left: auto;
    margin-right: auto;
  }
  
  /* Keep lists and code blocks left-aligned for readability but centered as blocks */
  ul, ol, pre, code {
    text-align: left;
    display: inline-block;
    max-width: 100%;
  }
`;

interface KnowledgeCardContentProps {
  markdownContent: string;
}

const KnowledgeCardContent: React.FC<KnowledgeCardContentProps> = ({
  markdownContent,
}) => {
  return (
    <ContentWrapper>
      <StyledMarkdownPreview
        source={markdownContent}
        useParentBackgroundColor={true}
      />
    </ContentWrapper>
  );
};

export default KnowledgeCardContent;