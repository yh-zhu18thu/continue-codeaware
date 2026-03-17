import {
  AcademicCapIcon,
  BookmarkIcon,
  QuestionMarkCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";
import type { PinnedItem } from "core";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";
import {
  defaultBorderRadius,
  vscBackground,
  vscForeground,
  vscInputBackground,
  vscInputBorder,
} from "../../../../components";

/* ─── types ─── */
export type OverlayTab = "confusion" | "self-test" | "pins";

export interface GlobalInteractionOverlayProps {
  isOpen: boolean;
  initialTab?: OverlayTab;
  onClose: () => void;
  /** Confusion tab: submit a free-text question */
  onConfusionSubmit: (question: string) => void;
  confusionLoading?: boolean;
  /** Self-test tab: request generation */
  onRequestSelfTest: () => void;
  selfTestLoading?: boolean;
  /** Self-test content rendered by parent (quiz cards etc.) */
  selfTestContent?: React.ReactNode;
  /** Pin tab data */
  pinnedItems: PinnedItem[];
  onPinNavigate: (item: PinnedItem) => void;
  onPinRemove: (itemId: string) => void;
}

/* ─── styled ─── */
const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
  backdrop-filter: blur(3px);
  animation: gio-fade 0.2s ease-out;

  @keyframes gio-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const Panel = styled.div`
  position: relative;
  width: min(460px, 92vw);
  max-height: 70vh;
  background: ${vscBackground};
  border: 1px solid ${vscInputBorder};
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  animation: gio-slide 0.25s ease-out;

  @keyframes gio-slide {
    from {
      opacity: 0;
      transform: translateY(-16px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 0;
  flex-shrink: 0;
`;

const TabRow = styled.div`
  display: flex;
  gap: 2px;
  padding: 8px 14px 0;
  flex-shrink: 0;
`;

const Tab = styled.button<{ $active: boolean }>`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 7px 0;
  border: none;
  border-bottom: 2px solid
    ${(p) => (p.$active ? "var(--vscode-charts-blue, #3b82f6)" : "transparent")};
  background: transparent;
  color: ${(p) =>
    p.$active
      ? "var(--vscode-foreground)"
      : "var(--vscode-descriptionForeground)"};
  font-size: 12px;
  font-weight: ${(p) => (p.$active ? 600 : 400)};
  cursor: pointer;
  transition: all 150ms;

  &:hover {
    color: var(--vscode-foreground);
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const CloseBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  transition: all 150ms;

  &:hover {
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
    color: var(--vscode-foreground);
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const TabContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px 14px;

  scrollbar-width: thin;
  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background);
    border-radius: 2px;
  }
`;

/* confusion tab */
const QuestionArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const QuestionInput = styled.textarea`
  width: 100%;
  min-height: 60px;
  max-height: 120px;
  background: ${vscInputBackground};
  border: 1px solid ${vscInputBorder};
  border-radius: ${defaultBorderRadius};
  color: ${vscForeground};
  padding: 8px 10px;
  font-size: 12px;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: var(--vscode-focusBorder, #007acc);
    box-shadow: 0 0 0 1px var(--vscode-focusBorder, #007acc);
  }

  &::placeholder {
    color: var(--vscode-input-placeholderForeground);
  }
`;

const SendRow = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const SendBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  border: none;
  border-radius: 6px;
  background: var(--vscode-button-background, #007acc);
  color: var(--vscode-button-foreground, #fff);
  font-size: 12px;
  cursor: pointer;
  transition: background 150ms;

  &:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground, #005a9e);
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

const Spinner = styled.div`
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: gio-spin 0.8s linear infinite;
  @keyframes gio-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

/* self-test tab */
const CenteredHint = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px 0;
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  text-align: center;
`;

const GenerateBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 14px;
  border: 1px solid var(--vscode-button-border, transparent);
  border-radius: 6px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  font-size: 12px;
  cursor: pointer;
  transition: background 150ms;

  &:hover:not(:disabled) {
    background: var(--vscode-button-secondaryHoverBackground);
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

/* pin tab */
const PinList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const PinRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 150ms;

  &:hover {
    background: var(--vscode-list-hoverBackground);
  }
`;

const PinLabel = styled.span<{ $level: string }>`
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: uppercase;
  flex-shrink: 0;
  background: ${(p) =>
    p.$level === "step"
      ? "rgba(59,130,246,0.15)"
      : p.$level === "knowledge-card"
        ? "rgba(16,185,129,0.15)"
        : "rgba(245,158,11,0.15)"};
  color: ${(p) =>
    p.$level === "step"
      ? "#60a5fa"
      : p.$level === "knowledge-card"
        ? "#34d399"
        : "#fbbf24"};
`;

const PinTitle = styled.span`
  flex: 1;
  font-size: 12px;
  color: var(--vscode-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const PinRemoveBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 150ms;

  &:hover {
    background: var(--vscode-toolbar-hoverBackground);
    color: var(--vscode-errorForeground);
  }

  svg {
    width: 12px;
    height: 12px;
  }
`;

const EmptyHint = styled.div`
  padding: 24px 0;
  text-align: center;
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
`;

const TitleText = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: var(--vscode-foreground);
`;

/* ─── component ─── */
export const GlobalInteractionOverlay: React.FC<
  GlobalInteractionOverlayProps
> = ({
  isOpen,
  initialTab = "confusion",
  onClose,
  onConfusionSubmit,
  confusionLoading = false,
  onRequestSelfTest,
  selfTestLoading = false,
  selfTestContent,
  pinnedItems,
  onPinNavigate,
  onPinRemove,
}) => {
  const [activeTab, setActiveTab] = useState<OverlayTab>(initialTab);
  const [question, setQuestion] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Sync initial tab when prop changes while overlay opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setQuestion("");
    }
  }, [isOpen, initialTab]);

  // Auto-focus input when confusion tab is active
  useEffect(() => {
    if (isOpen && activeTab === "confusion") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, activeTab]);

  const handleSubmit = useCallback(() => {
    const q = question.trim();
    if (!q || confusionLoading) return;
    onConfusionSubmit(q);
    setQuestion("");
  }, [question, confusionLoading, onConfusionSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  if (!isOpen) return null;

  const tabIcons: Record<OverlayTab, React.ReactNode> = {
    confusion: <QuestionMarkCircleIcon />,
    "self-test": <AcademicCapIcon />,
    pins: <BookmarkIcon />,
  };

  const tabLabels: Record<OverlayTab, string> = {
    confusion: "困惑",
    "self-test": "自测",
    pins: `标记 (${pinnedItems.length})`,
  };

  return createPortal(
    <Overlay onClick={onClose}>
      <Panel onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <Header>
          <TitleText>CodeAware</TitleText>
          <CloseBtn onClick={onClose} title="关闭">
            <XMarkIcon />
          </CloseBtn>
        </Header>

        {/* tabs */}
        <TabRow>
          {(["confusion", "self-test", "pins"] as OverlayTab[]).map((tab) => (
            <Tab
              key={tab}
              $active={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              {tabIcons[tab]}
              {tabLabels[tab]}
            </Tab>
          ))}
        </TabRow>

        {/* content */}
        <TabContent>
          {activeTab === "confusion" && (
            <QuestionArea>
              <QuestionInput
                ref={inputRef}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入你的疑问… (⌘ + Enter 发送)"
                disabled={confusionLoading}
              />
              <SendRow>
                <SendBtn
                  onClick={handleSubmit}
                  disabled={!question.trim() || confusionLoading}
                >
                  {confusionLoading ? (
                    <Spinner />
                  ) : (
                    <>
                      <PaperAirplaneIcon />
                      发送
                    </>
                  )}
                </SendBtn>
              </SendRow>
            </QuestionArea>
          )}

          {activeTab === "self-test" && (
            <>
              {selfTestContent ? (
                selfTestContent
              ) : (
                <CenteredHint>
                  <span>
                    根据当前掌握情况生成自测题目，帮助检测你的理解水平。
                  </span>
                  <GenerateBtn
                    onClick={onRequestSelfTest}
                    disabled={selfTestLoading}
                  >
                    {selfTestLoading ? (
                      <Spinner />
                    ) : (
                      <>
                        <AcademicCapIcon />
                        生成自测题
                      </>
                    )}
                  </GenerateBtn>
                </CenteredHint>
              )}
            </>
          )}

          {activeTab === "pins" && (
            <>
              {pinnedItems.length === 0 ? (
                <EmptyHint>暂无标记项目。点击各层级的书签按钮添加。</EmptyHint>
              ) : (
                <PinList>
                  {pinnedItems.map((item) => (
                    <PinRow key={item.id} onClick={() => onPinNavigate(item)}>
                      <PinLabel $level={item.level}>
                        {item.level === "step"
                          ? "步骤"
                          : item.level === "knowledge-card"
                            ? "知识卡"
                            : "代码"}
                      </PinLabel>
                      <PinTitle>{item.title}</PinTitle>
                      <PinRemoveBtn
                        onClick={(e) => {
                          e.stopPropagation();
                          onPinRemove(item.id);
                        }}
                        title="移除标记"
                      >
                        <XMarkIcon />
                      </PinRemoveBtn>
                    </PinRow>
                  ))}
                </PinList>
              )}
            </>
          )}
        </TabContent>
      </Panel>
    </Overlay>,
    document.body,
  );
};

export default GlobalInteractionOverlay;
