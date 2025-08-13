import React, { useState } from "react";
import styled from "styled-components";
import { lightGray, vscBackground, vscForeground } from "../index";

const DialogOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const DialogContainer = styled.div`
  background-color: ${vscBackground};
  border: 1px solid ${lightGray};
  border-radius: 8px;
  padding: 24px;
  min-width: 400px;
  max-width: 500px;
`;

const DialogTitle = styled.h2`
  color: ${vscForeground};
  margin: 0 0 16px 0;
  font-size: 18px;
`;

const FormGroup = styled.div`
  margin-bottom: 16px;
`;

const Label = styled.label`
  display: block;
  color: ${vscForeground};
  margin-bottom: 8px;
  font-size: 14px;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 12px;
  background-color: ${vscBackground};
  border: 1px solid ${lightGray};
  border-radius: 4px;
  color: ${vscForeground};
  font-size: 14px;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: #007acc;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
`;

const Button = styled.button<{ primary?: boolean }>`
  padding: 8px 16px;
  border: 1px solid ${lightGray};
  border-radius: 4px;
  background-color: ${(props) => (props.primary ? "#007acc" : vscBackground)};
  color: ${(props) => (props.primary ? "white" : vscForeground)};
  cursor: pointer;
  font-size: 14px;

  &:hover {
    background-color: ${(props) =>
      props.primary ? "#005a9e" : "rgba(255, 255, 255, 0.1)"};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

interface CodeStudySessionDialogProps {
  isOpen: boolean;
  onSubmit: (username: string, sessionName: string) => void;
  onCancel: () => void;
}

export function CodeStudySessionDialog({
  isOpen,
  onSubmit,
  onCancel,
}: CodeStudySessionDialogProps) {
  const [username, setUsername] = useState("");
  const [sessionName, setSessionName] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim() && sessionName.trim()) {
      onSubmit(username.trim(), sessionName.trim());
      setUsername("");
      setSessionName("");
    }
  };

  const handleCancel = () => {
    setUsername("");
    setSessionName("");
    onCancel();
  };

  const isValid = username.trim().length > 0 && sessionName.trim().length > 0;

  return (
    <DialogOverlay onClick={handleCancel}>
      <DialogContainer onClick={(e) => e.stopPropagation()}>
        <DialogTitle>开始新的CodeStudy会话</DialogTitle>
        <form onSubmit={handleSubmit}>
          <FormGroup>
            <Label htmlFor="username">用户名:</Label>
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
            <Label htmlFor="sessionName">会话名称:</Label>
            <Input
              id="sessionName"
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="请输入会话名称"
            />
          </FormGroup>
          <ButtonGroup>
            <Button type="button" onClick={handleCancel}>
              取消
            </Button>
            <Button type="submit" primary disabled={!isValid}>
              开始会话
            </Button>
          </ButtonGroup>
        </form>
      </DialogContainer>
    </DialogOverlay>
  );
}
