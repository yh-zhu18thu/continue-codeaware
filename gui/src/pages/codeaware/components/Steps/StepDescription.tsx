import { ChatBubbleLeftRightIcon, WrenchIcon } from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import {
  defaultBorderRadius,
  vscBackground,
  vscEditorBackground,
  vscForeground,
  vscInputBorder
} from "../../../../components";
import StyledMarkdownPreview from "../../../../components/markdown/StyledMarkdownPreview";
import QuestionPopup from "../QuestionPopup/QuestionPopup";

const ContentArea = styled.div`
  border-radius: ${defaultBorderRadius};
  padding: 0.5rem;
  background-color: ${vscEditorBackground};
  color: ${vscForeground};
  font-size: 12px;
  position: relative;
  user-select: text; /* 允许文本选择 */
`;

const EditButton = styled.button`
  position: relative;
  color: ${vscForeground};
  cursor: pointer;
  padding: 0px;
  border-radius: 4px;
  transition: background-color 0.15s ease-in-out;
  opacity: 0.7;
  align-self: flex-end;
  margin-top: 0px;
  border: none;
  background: none;

  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
    opacity: 1;
  }

  &:active {
    background-color: rgba(255, 255, 255, 0.2);
  }
`;

const QuestionButton = styled.button<{ x: number; y: number; visible: boolean }>`
  position: fixed;
  left: ${props => props.x}px;
  top: ${props => props.y}px;
  display: ${props => props.visible ? 'flex' : 'none'};
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background-color: ${vscBackground};
  color: ${vscForeground};
  border: 1px solid ${vscInputBorder};
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  z-index: 999;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  transition: all 0.15s ease-in-out;

  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
  }

  &:active {
    background-color: rgba(255, 255, 255, 0.2);
    transform: translateY(0);
  }
`;

interface StepDescriptionProps {
  markdownContent: string;
  isVisible?: boolean; // Control visibility for collapsing
  onEdit?: () => void; // Callback for edit functionality
  onQuestionSubmit?: (selectedText: string, question: string) => void; // Callback for question submission
}

const StepDescription: React.FC<StepDescriptionProps> = ({
  markdownContent,
  isVisible = true,
  onEdit,
  onQuestionSubmit,
}) => {
  const [selectedText, setSelectedText] = useState('');
  const [questionButtonPosition, setQuestionButtonPosition] = useState({ x: 0, y: 0 });
  const [showQuestionButton, setShowQuestionButton] = useState(false);
  const [showQuestionPopup, setShowQuestionPopup] = useState(false);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const selectedTextRef = useRef<string>(''); // 添加 ref 来保存选中的文本
  const isPopupOpenRef = useRef<boolean>(false); // 添加弹窗状态的 ref
  const popupTextRef = useRef<string>(''); // 专门用于弹窗显示的文本
  
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || !contentAreaRef.current || selection.rangeCount === 0) return;

    const selectedTextContent = selection.toString().trim();
    console.log('Selected text content:', selectedTextContent);
    
    if (selectedTextContent) {
      // 检查选择是否在我们的容器内
      const range = selection.getRangeAt(0);
      const commonAncestor = range.commonAncestorContainer;
      
      // 检查选择的文本是否在我们的内容区域内
      const isInside = contentAreaRef.current.contains(
        commonAncestor.nodeType === Node.TEXT_NODE ? commonAncestor.parentNode : commonAncestor
      );
      
      if (isInside) {
        setSelectedText(selectedTextContent);
        selectedTextRef.current = selectedTextContent; // 同时更新 ref
        console.log('Setting selected text:', selectedTextContent);
        
        // 获取选择区域的边界框来定位按钮
        const rect = range.getBoundingClientRect();
        
        // 计算按钮位置（选择区域右上方）
        setQuestionButtonPosition({
          x: rect.right + 8,
          y: rect.top - 8
        });
        
        setShowQuestionButton(true);
        return;
      }
    }
    
    setShowQuestionButton(false);
    setSelectedText('');
    selectedTextRef.current = ''; // 同时清空 ref
  }, []);

  const handleQuestionButtonClick = useCallback(() => {
    const textToUse = selectedTextRef.current || selectedText;
    console.log('Opening question popup with selected text:', textToUse);
    console.log('selectedText state:', selectedText);
    console.log('selectedTextRef.current:', selectedTextRef.current);
    
    // 在弹窗打开前，将文本保存到专用的 ref
    popupTextRef.current = textToUse;
    isPopupOpenRef.current = true; // 标记弹窗已打开
    setShowQuestionButton(false);
    setShowQuestionPopup(true);
  }, [selectedText]);

  const handleQuestionSubmit = useCallback((question: string) => {
    const textToSubmit = popupTextRef.current || selectedTextRef.current || selectedText;
    console.log('Submitting question with text:', textToSubmit, 'question:', question);
    onQuestionSubmit?.(textToSubmit, question);
    
    // 清理状态
    isPopupOpenRef.current = false;
    popupTextRef.current = '';
    setShowQuestionPopup(false);
    setShowQuestionButton(false);
    setSelectedText('');
    selectedTextRef.current = '';
    // 清除文本选择
    window.getSelection()?.removeAllRanges();
  }, [selectedText, onQuestionSubmit]);

  const handleQuestionCancel = useCallback(() => {
    // 清理状态
    isPopupOpenRef.current = false;
    popupTextRef.current = '';
    setShowQuestionPopup(false);
    setShowQuestionButton(false);
    setSelectedText('');
    selectedTextRef.current = '';
    // 清除文本选择
    window.getSelection()?.removeAllRanges();
  }, []);

  // 监听文本选择变化
  useEffect(() => {
    const handleMouseUp = () => {
      // 如果弹窗已打开，不处理文本选择
      if (isPopupOpenRef.current) return;
      // 延迟一下，让选择操作完成
      setTimeout(handleTextSelection, 10);
    };

    const handleClickOutside = (e: MouseEvent) => {
      // 如果弹窗已打开，不处理点击外部事件
      if (isPopupOpenRef.current) return;
      
      if (contentAreaRef.current && !contentAreaRef.current.contains(e.target as Node)) {
        setShowQuestionButton(false);
        setSelectedText('');
        selectedTextRef.current = '';
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('click', handleClickOutside);
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [handleTextSelection]);

  if (!isVisible) {
    return null;
  }

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.();
  };

  return (
    <>
      <div className="px-1 flex flex-col">
        <ContentArea ref={contentAreaRef}>
          <StyledMarkdownPreview
            source={markdownContent}
            useParentBackgroundColor={true}
          />
          {onEdit && (
            <div className="flex justify-end">
              <EditButton onClick={handleEditClick} title="修改此步骤">
                <WrenchIcon width={16} height={16} />
              </EditButton>
            </div>
          )}
        </ContentArea>
      </div>

      {/* 悬浮的提问按钮 */}
      <QuestionButton
        x={questionButtonPosition.x}
        y={questionButtonPosition.y}
        visible={showQuestionButton}
        onClick={handleQuestionButtonClick}
        title="对选中内容提问"
      >
        <ChatBubbleLeftRightIcon width={16} height={16} />
      </QuestionButton>

      {/* 提问弹窗 */}
      {showQuestionPopup && (
        <QuestionPopup
          selectedText={popupTextRef.current || selectedTextRef.current || selectedText}
          onSubmit={handleQuestionSubmit}
          onCancel={handleQuestionCancel}
        />
      )}
    </>
  );
};

export default StepDescription;