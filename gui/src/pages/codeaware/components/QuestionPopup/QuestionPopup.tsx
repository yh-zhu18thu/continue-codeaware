import { XMarkIcon } from '@heroicons/react/24/outline';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import {
  defaultBorderRadius,
  vscBackground,
  vscForeground,
  vscInputBackground,
  vscInputBorder
} from "../../../../components";

const PopupOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
  backdrop-filter: blur(2px);
`;

const PopupContainer = styled.div`
  background-color: ${vscBackground};
  border: 1px solid ${vscInputBorder};
  border-radius: ${defaultBorderRadius};
  padding: 12px;
  max-width: 350px;
  width: 90%;
  max-height: 50vh;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
`;

const SelectedTextContainer = styled.div`
  background-color: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: ${defaultBorderRadius};
  padding: 8px;
  margin-bottom: 8px;
  max-height: 80px;
  overflow-y: auto;
  color: ${vscForeground};
  font-size: 12px;
  line-height: 1.3;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: inherit;
`;

const QuestionInput = styled.textarea`
  width: calc(100% - 24px);
  min-height: 28px;
  max-height: 100px;
  background-color: ${vscInputBackground};
  border: 1px solid ${vscInputBorder};
  border-radius: ${defaultBorderRadius};
  color: ${vscForeground};
  padding: 6px 12px;
  font-size: 12px;
  font-family: inherit;
  resize: vertical;
  margin-bottom: 8px;
  line-height: 1.3;

  &:focus {
    outline: none;
    border-color: #007acc;
    box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
  }

  &::placeholder {
    color: ${vscForeground};
    opacity: 0.5;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`;

const Button = styled.button<{ variant: 'primary' | 'secondary' }>`
  padding: 4px 8px;
  border-radius: ${defaultBorderRadius};
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease-in-out;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 28px;
  
  ${({ variant }) => variant === 'primary' ? `
    background-color: #007acc;
    color: white;
    border: 1px solid #007acc;
    
    &:hover {
      background-color: #005a9e;
      border-color: #005a9e;
    }
    
    &:active {
      background-color: #004578;
      border-color: #004578;
    }
  ` : `
    background-color: transparent;
    color: ${vscForeground};
    border: 1px solid ${vscInputBorder};
    
    &:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
    
    &:active {
      background-color: rgba(255, 255, 255, 0.2);
    }
  `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

interface QuestionPopupProps {
  selectedText?: string;
  onSubmit: (question: string) => void;
  onCancel: () => void;
}

const QuestionPopup: React.FC<QuestionPopupProps> = ({
  selectedText,
  onSubmit,
  onCancel,
}) => {
  const [question, setQuestion] = useState('');
  const questionInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Focus on the input when the popup opens
    if (questionInputRef.current) {
      // 使用 setTimeout 避免与文本选择冲突
      setTimeout(() => {
        questionInputRef.current?.focus();
      }, 0);
    }
    // Debug: log the selected text
    console.log('QuestionPopup selectedText:', selectedText);
  }, [selectedText]);

  const handleSubmit = useCallback(() => {
    if (question.trim()) {
      onSubmit(question.trim());
    }
  }, [question, onSubmit]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  }, [handleCancel]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleCancel, handleSubmit]);

  return (
    <PopupOverlay onClick={handleOverlayClick}>
      <PopupContainer onKeyDown={handleKeyDown}>
        {selectedText && selectedText.trim() && (
          <SelectedTextContainer>
            {selectedText}
          </SelectedTextContainer>
        )}

        <QuestionInput
          ref={questionInputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="输入您的问题..."
          onKeyDown={handleKeyDown}
        />

        <ButtonGroup>
          <Button variant="secondary" onClick={handleCancel} title="取消">
            <XMarkIcon width={14} height={14} />
          </Button>
          <Button 
            variant="primary" 
            onClick={handleSubmit}
            disabled={!question.trim()}
            title="提问"
          >
            <PaperAirplaneIcon width={14} height={14} />
          </Button>
        </ButtonGroup>
      </PopupContainer>
    </PopupOverlay>
  );
};

export default QuestionPopup;
