import React, { useCallback, useEffect, useRef, useState } from "react";
import styled, { keyframes } from "styled-components";

export interface ActionToastAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

export interface ActionToastProps {
  message: string;
  actions: ActionToastAction[];
  duration?: number; // ms, default 3000
  onDismiss: () => void;
}

const slideIn = keyframes`
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
`;

const slideOut = keyframes`
  from { transform: translateY(0);    opacity: 1; }
  to   { transform: translateY(100%); opacity: 0; }
`;

const Wrapper = styled.div<{ $leaving: boolean }>`
  position: fixed;
  bottom: 16px;
  left: 8px;
  right: 8px;
  z-index: 1100;
  display: flex;
  justify-content: center;
  animation: ${(p) => (p.$leaving ? slideOut : slideIn)} 220ms ease forwards;
`;

const Card = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  padding-left: 24px;
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  flex-wrap: wrap;
  max-width: 100%;
`;

const CloseBtn = styled.button`
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  cursor: pointer;
  border-radius: 3px;
  opacity: 0.7;

  &:hover {
    opacity: 1;
    background: var(--vscode-toolbar-hoverBackground);
  }
`;

const Message = styled.span`
  color: var(--vscode-editor-foreground);
  font-size: 13px;
`;

const Btn = styled.button<{ $primary?: boolean }>`
  border: 1px solid var(--vscode-button-border, transparent);
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  background: ${(p) =>
    p.$primary
      ? "var(--vscode-button-background)"
      : "var(--vscode-button-secondaryBackground)"};
  color: ${(p) =>
    p.$primary
      ? "var(--vscode-button-foreground)"
      : "var(--vscode-button-secondaryForeground)"};

  &:hover {
    background: ${(p) =>
      p.$primary
        ? "var(--vscode-button-hoverBackground)"
        : "var(--vscode-button-secondaryHoverBackground)"};
  }
`;

const ActionToast: React.FC<ActionToastProps> = ({
  message,
  actions,
  duration = 3000,
  onDismiss,
}) => {
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredRef = useRef(false);

  const dismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(onDismiss, 220); // match animation
  }, [onDismiss]);

  // Auto-dismiss timer
  useEffect(() => {
    const start = () => {
      timerRef.current = setTimeout(dismiss, duration);
    };
    start();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dismiss, duration]);

  const handleMouseEnter = () => {
    hoveredRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleMouseLeave = () => {
    hoveredRef.current = false;
    timerRef.current = setTimeout(dismiss, duration);
  };

  return (
    <Wrapper
      $leaving={leaving}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Card>
        <CloseBtn onClick={dismiss} title="关闭">
          ×
        </CloseBtn>
        <Message>{message}</Message>
        {actions.map((a, i) => (
          <Btn
            key={i}
            $primary={a.variant === "primary"}
            onClick={() => {
              a.onClick();
              dismiss();
            }}
          >
            {a.label}
          </Btn>
        ))}
      </Card>
    </Wrapper>
  );
};

export default ActionToast;
