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
  duration?: number; // ms, default 5000
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
  left: 50%;
  transform: translateX(-50%);
  z-index: 1100;
  animation: ${(p) => (p.$leaving ? slideOut : slideIn)} 220ms ease forwards;
`;

const Card = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  white-space: nowrap;
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
  duration = 5000,
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
