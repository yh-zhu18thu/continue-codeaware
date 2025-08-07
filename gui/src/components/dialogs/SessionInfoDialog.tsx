import React, { useState } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";
import {
  defaultBorderRadius,
  vscBackground,
  vscForeground,
  vscInputBackground,
  vscInputBorder
} from "../../components";

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 99999;
  backdrop-filter: blur(2px);
`;

const ModalContent = styled.div`
  background-color: ${vscBackground};
  border: 1px solid ${vscInputBorder};
  border-radius: ${defaultBorderRadius};
  padding: 16px;
  max-width: 300px;
  width: 85%;
  max-height: 60vh;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
`;

const ModalTitle = styled.h2`
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: ${vscForeground};
`;

const FormGroup = styled.div`
  margin-bottom: 10px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 500;
  color: ${vscForeground};
`;

const Input = styled.input`
  width: calc(100% - 24px);
  padding: 6px 12px;
  background-color: ${vscInputBackground};
  border: 1px solid ${vscInputBorder};
  border-radius: ${defaultBorderRadius};
  color: ${vscForeground};
  font-size: 12px;
  font-family: inherit;
  box-sizing: border-box;
  
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
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
`;

const Button = styled.button<{ variant?: "primary" | "secondary" }>`
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
  border: 1px solid;
  
  ${props => props.variant === "primary" ? `
    background-color: #007acc;
    color: white;
    border-color: #007acc;
    
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
    border-color: ${vscInputBorder};
    
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

interface SessionInfoDialogProps {
  isOpen: boolean;
  onSubmit: (username: string, sessionName: string) => void;
  onCancel: () => void;
}

export const SessionInfoDialog: React.FC<SessionInfoDialogProps> = ({
  isOpen,
  onSubmit,
  onCancel
}) => {
  const [username, setUsername] = useState("");
  const [sessionName, setSessionName] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim() && sessionName.trim()) {
      onSubmit(username.trim(), sessionName.trim());
      // Reset form
      setUsername("");
      setSessionName("");
    }
  };

  const handleCancel = () => {
    onCancel();
    // Reset form
    setUsername("");
    setSessionName("");
  };

  const isValid = username.trim().length > 0 && sessionName.trim().length > 0;

  if (!isOpen) return null;

  return createPortal(
    <ModalOverlay 
      onClick={handleCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          handleCancel();
        }
      }}
      tabIndex={-1}
    >
      <ModalContent 
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            handleCancel();
          } else if (e.key === 'Enter' && isValid) {
            handleSubmit(e as any);
          }
        }}
      >
        <ModalTitle>新建 CodeAware 会话</ModalTitle>
        <form onSubmit={handleSubmit}>
          <FormGroup>
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入您的用户名"
              autoFocus
            />
          </FormGroup>
          
          <FormGroup>
            <Label htmlFor="sessionName">会话名称</Label>
            <Input
              id="sessionName"
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="请输入会话名称"
            />
          </FormGroup>
          
          <ButtonGroup>
            <Button type="button" variant="secondary" onClick={handleCancel}>
              取消
            </Button>
            <Button type="submit" variant="primary" disabled={!isValid}>
              开始会话
            </Button>
          </ButtonGroup>
        </form>
      </ModalContent>
    </ModalOverlay>,
    document.body
  );
};
