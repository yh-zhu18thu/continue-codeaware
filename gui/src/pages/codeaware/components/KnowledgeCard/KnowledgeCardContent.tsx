import React from 'react';
import styled from "styled-components";
import {
    defaultBorderRadius,
    vscEditorBackground,
    vscForeground
} from "../../../../components";
import StyledMarkdownPreview from "../../../../components/markdown/StyledMarkdownPreview";

const ContentWrapper = styled.div<{ isHighlighted?: boolean; isFlickering?: boolean }>`
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  background-color: ${vscEditorBackground};
  color: ${vscForeground};
  padding: 2px; /* 减少内边距以节省空间 */
  border-radius: ${defaultBorderRadius};
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  border: 1px solid ${({ isHighlighted, isFlickering }) => 
    isFlickering ? '#ff6b6b' : 
    isHighlighted ? '#4ade80' : 
    'transparent'};
  margin: 2px 0; /* 减少外边距 */
  font-size: 11px; /* 在窄屏下使用更小的字体 */
  transition: border-color 0.15s ease-in-out;
  overflow: hidden; /* 防止内容溢出 */
  
  /* Center any block elements within the markdown content */
  & > * {
    margin-left: auto;
    margin-right: auto;
    max-width: 100%;
    box-sizing: border-box;
  }
  
  /* Keep lists and code blocks left-aligned for readability but centered as blocks */
  ul, ol, pre, code {
    text-align: left;
    display: inline-block;
    max-width: 100%;
    box-sizing: border-box;
  }
  
  /* 确保所有子元素都不会超出容器 */
  * {
    max-width: 100% !important;
    box-sizing: border-box !important;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
`;

interface KnowledgeCardContentProps {
  markdownContent: string;
  isHighlighted?: boolean;
  isFlickering?: boolean;
}

const KnowledgeCardContent: React.FC<KnowledgeCardContentProps> = ({
  markdownContent,
  isHighlighted = false,
  isFlickering = false,
}) => {
  return (
    <ContentWrapper isHighlighted={isHighlighted} isFlickering={isFlickering}>
      <div style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
        <StyledMarkdownPreview
          source={markdownContent}
          useParentBackgroundColor={true}
        />
      </div>
    </ContentWrapper>
  );
};

export default KnowledgeCardContent;