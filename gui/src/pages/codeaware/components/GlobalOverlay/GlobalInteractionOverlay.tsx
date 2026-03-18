import {
  BookmarkIcon,
  QuestionMarkCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import type { PinnedItem } from "core";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";
import {
  defaultBorderRadius,
  vscBackground,
  vscForeground,
  vscInputBackground,
  vscInputBorder,
} from "../../../../components";
import ConfusionPanel, {
  ConfusionCandidate,
  ConfusionMessage,
} from "../shared/ConfusionPanel";

/* ─── types ─── */
export type OverlayTab = "confusion" | "pins";

export interface GlobalInteractionOverlayProps {
  isOpen: boolean;
  initialTab?: OverlayTab;
  onClose: () => void;
  /** Confusion tab: ConfusionPanel onAsk callback */
  onConfusionAsk: (question: string) => Promise<string>;
  /** Confusion tab: called when user confirms understanding */
  onConfusionEnd: (messages: ConfusionMessage[]) => void;
  /** Confusion tab: mastery-based candidates */
  confusionCandidates?: ConfusionCandidate[];
  confusionCandidatesLoading?: boolean;
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

/* confusion tab - Q&A conversation */
const QuestionArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ConversationArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
`;

const MessageBubble = styled.div<{ $role: "user" | "assistant" }>`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 12.5px;
  line-height: 1.55;
  max-width: 100%;
  word-wrap: break-word;
  overflow-wrap: break-word;

  ${(p) =>
    p.$role === "user"
      ? `
    background: var(--vscode-button-background, #007acc);
    color: var(--vscode-button-foreground, #fff);
    align-self: flex-end;
    border-bottom-right-radius: 3px;
    max-width: 85%;
  `
      : `
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-editorWidget-border, var(--vscode-widget-border, rgba(128,128,128,0.2)));
    color: var(--vscode-foreground);
    align-self: flex-start;
    border-bottom-left-radius: 3px;

    /* Markdown content styling */
    .wmde-markdown {
      font-size: 12.5px !important;
      line-height: 1.55 !important;
      color: var(--vscode-foreground) !important;
      background: transparent !important;
      p { margin: 0 0 6px; }
      p:last-child { margin-bottom: 0; }
      code {
        font-size: 11px;
        background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.12)) !important;
        padding: 1px 4px;
        border-radius: 3px;
      }
      pre {
        background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.12)) !important;
        border-radius: 4px;
        padding: 8px;
        margin: 4px 0;
      }
      ul, ol { margin: 2px 0; padding-left: 18px; }
      li { margin: 1px 0; }
    }
  `}
`;

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
  margin-top: 2px;
  margin-left: 4px;
  flex-wrap: wrap;
`;

/* Unified icon-text action button — matches UnifiedActionBar pattern */
const ActionBtn = styled.button<{ $variant?: "default" | "primary" }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  cursor: pointer;
  transition: all 150ms ease;

  &:hover:not(:disabled) {
    background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31));
    color: var(--vscode-foreground);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  /* Primary variant for "结束提问" */
  ${(p) =>
    p.$variant === "primary" &&
    `
    color: var(--vscode-charts-blue, #3b82f6);

    &:hover:not(:disabled) {
      background: rgba(59, 130, 246, 0.12);
      color: var(--vscode-charts-blue, #3b82f6);
    }
  `}
`;

const LoadingBubble = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  border-bottom-left-radius: 3px;
  background: var(
    --vscode-editorWidget-background,
    var(--vscode-editor-background)
  );
  border: 1px solid
    var(
      --vscode-editorWidget-border,
      var(--vscode-widget-border, rgba(128, 128, 128, 0.2))
    );
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
  align-self: flex-start;
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
  align-items: center;
  gap: 6px;
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
  transition: all 150ms ease;

  &:hover:not(:disabled) {
    background: var(--vscode-button-hoverBackground, #005a9e);
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  svg {
    width: 13px;
    height: 13px;
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
  onConfusionAsk,
  onConfusionEnd,
  confusionCandidates = [],
  confusionCandidatesLoading = false,
  pinnedItems,
  onPinNavigate,
  onPinRemove,
}) => {
  const [activeTab, setActiveTab] = useState<OverlayTab>(initialTab);

  // Sync initial tab when prop changes while overlay opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const tabIcons: Record<OverlayTab, React.ReactNode> = {
    confusion: <QuestionMarkCircleIcon />,
    pins: <BookmarkIcon />,
  };

  const tabLabels: Record<OverlayTab, string> = {
    confusion: "困惑",
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
          {(["confusion", "pins"] as OverlayTab[]).map((tab) => (
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
            <ConfusionPanel
              isOpen={true}
              candidates={confusionCandidates}
              candidatesLoading={confusionCandidatesLoading}
              onAsk={onConfusionAsk}
              onEnd={onConfusionEnd}
            />
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
