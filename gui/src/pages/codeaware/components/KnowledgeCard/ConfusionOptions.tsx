import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import {
  defaultBorderRadius,
  lightGray,
  vscBackground,
  vscForeground,
  vscInputBorder,
} from "../../../../components";

export type ConfusionOptionType = "example" | "analogy" | "detail" | "custom";

export interface ConfusionOptionsProps {
  onSelect: (type: ConfusionOptionType, customQuestion?: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

const Wrapper = styled.div`
  position: relative;
  display: inline-flex;
`;

const TriggerButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  border: 1px dashed ${vscInputBorder};
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 11px;
  cursor: pointer;
  transition: all 150ms;

  &:hover:not(:disabled) {
    color: ${vscForeground};
    border-color: var(--vscode-focusBorder, #007acc);
    background: rgba(0, 122, 204, 0.06);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const Popover = styled.div`
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  min-width: 180px;
  background: ${vscBackground};
  border: 1px solid ${vscInputBorder};
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  z-index: 200;
  overflow: hidden;
  animation: co-pop 0.15s ease-out;

  @keyframes co-pop {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
`;

const OptionItem = styled.button`
  display: block;
  width: 100%;
  padding: 7px 12px;
  border: none;
  background: transparent;
  color: ${vscForeground};
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: background 120ms;

  &:hover {
    background: var(--vscode-list-hoverBackground, rgba(90, 93, 94, 0.31));
  }

  &:not(:last-child) {
    border-bottom: 1px solid ${lightGray}22;
  }
`;

const CustomInputRow = styled.div`
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  border-top: 1px solid ${lightGray}22;
`;

const CustomInput = styled.input`
  flex: 1;
  background: var(--vscode-input-background);
  border: 1px solid ${vscInputBorder};
  border-radius: ${defaultBorderRadius};
  color: ${vscForeground};
  padding: 3px 6px;
  font-size: 11px;

  &:focus {
    outline: none;
    border-color: var(--vscode-focusBorder, #007acc);
  }
`;

const CustomSendBtn = styled.button`
  padding: 3px 8px;
  border: none;
  border-radius: ${defaultBorderRadius};
  background: var(--vscode-button-background, #007acc);
  color: var(--vscode-button-foreground, #fff);
  font-size: 11px;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Spinner = styled.div`
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--vscode-descriptionForeground);
  border-top-color: var(--vscode-foreground);
  border-radius: 50%;
  animation: co-spin 0.8s linear infinite;
  @keyframes co-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const PRESET_OPTIONS: { type: ConfusionOptionType; label: string }[] = [
  { type: "example", label: "举例说明" },
  { type: "analogy", label: "类比理解" },
  { type: "detail", label: "补充细节" },
];

const ConfusionOptions: React.FC<ConfusionOptionsProps> = ({
  onSelect,
  disabled = false,
  loading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const handlePresetClick = (type: ConfusionOptionType) => {
    setIsOpen(false);
    onSelect(type);
  };

  const handleCustomSubmit = () => {
    const q = customText.trim();
    if (!q) return;
    setIsOpen(false);
    setCustomText("");
    onSelect("custom", q);
  };

  return (
    <Wrapper ref={wrapperRef}>
      <TriggerButton
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || loading}
        title="我有疑惑"
      >
        {loading ? <Spinner /> : <QuestionMarkCircleIcon />}
        我有疑惑
      </TriggerButton>

      {isOpen && (
        <Popover>
          {PRESET_OPTIONS.map((opt) => (
            <OptionItem
              key={opt.type}
              onClick={() => handlePresetClick(opt.type)}
            >
              {opt.label}
            </OptionItem>
          ))}
          <CustomInputRow>
            <CustomInput
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="自定义提问…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCustomSubmit();
                }
              }}
              autoFocus
            />
            <CustomSendBtn
              onClick={handleCustomSubmit}
              disabled={!customText.trim()}
            >
              发送
            </CustomSendBtn>
          </CustomInputRow>
        </Popover>
      )}
    </Wrapper>
  );
};

export default ConfusionOptions;
