import {
  ChatBubbleLeftIcon,
  CheckCircleIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";
import React, { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import {
  defaultBorderRadius,
  vscForeground,
  vscInputBackground,
  vscInputBorder,
} from "../../../../components";
import StyledMarkdownPreview from "../../../../components/StyledMarkdownPreview";

/* ─── types ─── */
export interface ConfusionCandidate {
  id: string;
  label: string;
  description?: string;
}

export interface ConfusionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ConfusionPanelProps {
  /** Whether the panel is visible */
  isOpen: boolean;
  /** Candidate chips to display above input */
  candidates: ConfusionCandidate[];
  /** Whether candidates are being generated */
  candidatesLoading?: boolean;
  /** Called when user submits a question; should return AI response text */
  onAsk: (question: string) => Promise<string>;
  /** Called when user confirms understanding ("我懂了"); receives full message history */
  onEnd: (messages: ConfusionMessage[]) => void;
  /** Called when panel is closed without ending (optional) */
  onClose?: () => void;
}

const MAX_ROUNDS = 10; // 5 rounds × 2 messages each

/* ─── styled components (matching GlobalInteractionOverlay style) ─── */
const PanelContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 0 4px;
  animation: cp-slide 0.2s ease-out;

  @keyframes cp-slide {
    from {
      opacity: 0;
      max-height: 0;
    }
    to {
      opacity: 1;
      max-height: 600px;
    }
  }
`;

const CandidateArea = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 2px;
`;

const CandidateChip = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px dashed ${vscInputBorder};
  border-radius: 14px;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  cursor: pointer;
  transition: all 150ms;
  white-space: nowrap;

  &:hover:not(:disabled) {
    color: ${vscForeground};
    border-color: var(--vscode-focusBorder, #007acc);
    background: rgba(0, 122, 204, 0.06);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

/* Shimmer skeleton for loading candidates */
const ShimmerChip = styled.div`
  display: inline-block;
  width: 72px;
  height: 24px;
  border-radius: 14px;
  background: linear-gradient(
    90deg,
    var(--vscode-editor-inactiveSelectionBackground) 25%,
    var(--vscode-editorWidget-background, rgba(128, 128, 128, 0.12)) 50%,
    var(--vscode-editor-inactiveSelectionBackground) 75%
  );
  background-size: 200% 100%;
  animation: cp-shimmer 1.5s ease-in-out infinite;

  @keyframes cp-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

const ConversationArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
  padding: 0 2px;

  scrollbar-width: thin;
  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background);
    border-radius: 2px;
  }
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
  min-height: 48px;
  max-height: 100px;
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

const Spinner = styled.div`
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: cp-spin 0.8s linear infinite;
  @keyframes cp-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

/* ─── component ─── */
const ConfusionPanel: React.FC<ConfusionPanelProps> = ({
  isOpen,
  candidates,
  candidatesLoading = false,
  onAsk,
  onEnd,
  onClose,
}) => {
  const [messages, setMessages] = useState<ConfusionMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  // Reset state when panel opens/closes
  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      setQuestion("");
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  }, [messages.length]);

  const doAsk = useCallback(
    async (q: string) => {
      if (!q.trim() || isLoading) return;

      const userMsg: ConfusionMessage = {
        id: `cp-${Date.now()}-u`,
        role: "user",
        content: q.trim(),
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setQuestion("");
      setIsLoading(true);

      try {
        const response = await onAsk(q.trim());

        const assistantMsg: ConfusionMessage = {
          id: `cp-${Date.now()}-a`,
          role: "assistant",
          content: response,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (error) {
        const errorMsg: ConfusionMessage = {
          id: `cp-${Date.now()}-e`,
          role: "assistant",
          content: "抱歉，回复生成失败，请重试。",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, onAsk],
  );

  const handleSubmit = useCallback(() => {
    void doAsk(question);
  }, [question, doAsk]);

  const handleCandidateClick = useCallback((candidate: ConfusionCandidate) => {
    // Fill the input for user to review/edit before sending
    setQuestion(candidate.label);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleStillConfused = useCallback(() => {
    void doAsk("我还是不太理解，能换一种方式解释吗？");
  }, [doAsk]);

  const handleEnd = useCallback(() => {
    onEnd(messages);
    setMessages([]);
    setQuestion("");
  }, [messages, onEnd]);

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

  const hasConversation = messages.length > 0;
  const reachedMaxRounds = messages.length >= MAX_ROUNDS;
  const lastAssistantIdx = messages.reduce(
    (acc, msg, idx) => (msg.role === "assistant" ? idx : acc),
    -1,
  );

  return (
    <PanelContainer>
      {/* Candidate chips */}
      {(!hasConversation || !reachedMaxRounds) && (
        <CandidateArea>
          {candidatesLoading ? (
            <>
              <ShimmerChip style={{ width: 80 }} />
              <ShimmerChip style={{ width: 64 }} />
              <ShimmerChip style={{ width: 88 }} />
              <ShimmerChip style={{ width: 72 }} />
            </>
          ) : (
            candidates.map((c) => (
              <CandidateChip
                key={c.id}
                onClick={() => handleCandidateClick(c)}
                disabled={isLoading}
                title={c.description}
              >
                {c.label}
              </CandidateChip>
            ))
          )}
        </CandidateArea>
      )}

      {/* Conversation */}
      {hasConversation && (
        <ConversationArea>
          {messages.map((msg, idx) => (
            <React.Fragment key={msg.id}>
              <MessageBubble $role={msg.role}>
                {msg.role === "assistant" ? (
                  <StyledMarkdownPreview
                    source={msg.content}
                    isRenderingInStepContainer={true}
                  />
                ) : (
                  msg.content
                )}
              </MessageBubble>
              {/* Action buttons after the LAST assistant message */}
              {msg.role === "assistant" &&
                idx === lastAssistantIdx &&
                !isLoading && (
                  <ActionRow>
                    <ActionBtn onClick={() => inputRef.current?.focus()}>
                      <ChatBubbleLeftIcon />
                      继续追问
                    </ActionBtn>
                    <ActionBtn
                      onClick={handleStillConfused}
                      disabled={isLoading}
                    >
                      <QuestionMarkCircleIcon />
                      还不懂
                    </ActionBtn>
                    <ActionBtn $variant="primary" onClick={handleEnd}>
                      <CheckCircleIcon />
                      我懂了
                    </ActionBtn>
                  </ActionRow>
                )}
            </React.Fragment>
          ))}
          {/* Loading indicator */}
          {isLoading && (
            <LoadingBubble>
              <Spinner />
              正在思考…
            </LoadingBubble>
          )}
          {/* Max rounds hint */}
          {reachedMaxRounds && (
            <ActionRow>
              <ActionBtn $variant="primary" onClick={handleEnd}>
                <CheckCircleIcon />
                已达最大对话轮次，点击结束
              </ActionBtn>
            </ActionRow>
          )}
          <div ref={conversationEndRef} />
        </ConversationArea>
      )}

      {/* Input area */}
      {(!hasConversation || !reachedMaxRounds) && (
        <>
          <QuestionInput
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              hasConversation
                ? "继续提问… (⌘ + Enter 发送)"
                : "输入你的疑问… (⌘ + Enter 发送)"
            }
            disabled={isLoading}
          />
          <SendRow>
            {onClose && !hasConversation && (
              <ActionBtn onClick={onClose}>取消</ActionBtn>
            )}
            <SendBtn
              onClick={handleSubmit}
              disabled={!question.trim() || isLoading}
            >
              {isLoading && !hasConversation ? (
                <Spinner />
              ) : (
                <>
                  <PaperAirplaneIcon />
                  发送
                </>
              )}
            </SendBtn>
          </SendRow>
        </>
      )}
    </PanelContainer>
  );
};

export default ConfusionPanel;

/* ─── Preset candidates for knowledge card / overlay follow-up ─── */
export const DEEPDIVE_CANDIDATES: ConfusionCandidate[] = [
  { id: "rephrase", label: "换种说法", description: "用不同方式重新表述" },
  { id: "example", label: "举例子", description: "提供具体实例帮助理解" },
  { id: "analogy", label: "打比方", description: "用生活化类比解释概念" },
  {
    id: "detail",
    label: "详细具体解释",
    description: "更细致地展开说明",
  },
];
