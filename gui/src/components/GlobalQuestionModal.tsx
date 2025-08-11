import { PaperAirplaneIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { useState } from 'react';
import styled from "styled-components";
import {
    defaultBorderRadius,
    vscBackground,
    vscForeground,
    vscInputBackground,
    vscInputBorder
} from ".";

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

const QuestionInput = styled.textarea`
  width: calc(100% - 24px);
  min-height: 60px;
  max-height: 120px;
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
    
    &:hover:not(:disabled) {
      background-color: #005a9e;
      border-color: #005a9e;
    }
    
    &:active:not(:disabled) {
      background-color: #004578;
      border-color: #004578;
    }
  ` : `
    background-color: transparent;
    color: ${vscForeground};
    border: 1px solid ${vscInputBorder};
    
    &:hover:not(:disabled) {
      background-color: rgba(255, 255, 255, 0.1);
    }
    
    &:active:not(:disabled) {
      background-color: rgba(255, 255, 255, 0.2);
    }
  `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SpinnerDiv = styled.div`
  width: 14px;
  height: 14px;
  border: 2px solid white;
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

export interface GlobalQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (question: string) => void;
  isLoading?: boolean;
}

export default function GlobalQuestionModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading = false
}: GlobalQuestionModalProps) {
  const [question, setQuestion] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim() && !isLoading) {
      onSubmit(question.trim());
      setQuestion('');
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setQuestion('');
      onClose();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (question.trim() && !isLoading) {
        onSubmit(question.trim());
        setQuestion('');
      }
    }
  };

  return (
    <PopupOverlay onClick={handleOverlayClick}>
      <PopupContainer onKeyDown={handleKeyDown}>
        <QuestionInput
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="请输入您的问题，例如：这个项目中的数据结构是如何设计的？"
          disabled={isLoading}
          onKeyDown={handleKeyDown}
          autoFocus
        />

        <ButtonGroup>
          <Button 
            variant="secondary" 
            onClick={handleClose}
            disabled={isLoading}
            title="取消"
          >
            <XMarkIcon width={14} height={14} />
          </Button>
          <Button 
            variant="primary" 
            onClick={handleSubmit}
            disabled={!question.trim() || isLoading}
            title={isLoading ? "处理中..." : "提问"}
          >
            {isLoading ? (
              <SpinnerDiv />
            ) : (
              <PaperAirplaneIcon width={14} height={14} />
            )}
          </Button>
        </ButtonGroup>
      </PopupContainer>
    </PopupOverlay>
  );
}
