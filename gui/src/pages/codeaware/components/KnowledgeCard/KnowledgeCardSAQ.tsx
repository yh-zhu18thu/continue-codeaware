import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import React from 'react';
import styled from "styled-components";
import {
    defaultBorderRadius,
    lightGray,
    vscButtonBackground,
    vscForeground
} from "../../../../components";
import { ToolTip } from "../../../../components/gui/Tooltip";
import HoverItem from "../../../../components/mainInput/InputToolbar/HoverItem";
import { useCodeAwareLogger } from '../../../../util/codeAwareWebViewLogger';

const SAQContainer = styled.div`
  margin-top: 4px;
  width: 100%;
  text-align: center; /* Center the content */
`;

const QuestionSection = styled.div`
  width: 100%;
  padding: 12px;
  margin-bottom: 12px;
  border: 1px solid ${lightGray}33;
  border-radius: ${defaultBorderRadius};
  background-color: #1a1a1a; /* 深色背景 */
  color: ${vscForeground};
`;

const QuestionText = styled.p`
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  text-align: left;
`;

const EditorWrapper = styled.div`
  width: 100%;
  border: 1px solid ${lightGray}66;
  border-radius: ${defaultBorderRadius};
  background-color: #1a1a1a; /* 深色背景 */
  color: ${vscForeground};
  margin-bottom: 12px;
  
  .ProseMirror {
    min-height: 60px;
    width: 100%;
    padding: 10px;
    font-size: 12px;
    outline: none;
    text-align: left; /* Keep editor content left-aligned for typing */
    background-color: transparent; /* 确保编辑器背景透明 */
    
    &:focus {
      border-color: ${vscButtonBackground};
    }
  }
`;

const SubmitSection = styled.div`
  display: flex;
  justify-content: flex-end; /* Align submit button to the right */
  padding-right: 12px;
`;

const LoadingSpinner = styled.div`
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid ${lightGray}33;
  border-top: 2px solid ${vscButtonBackground};
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-right: 8px;

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const ResultSection = styled.div<{ isCorrect: boolean }>`
  width: 100%;
  padding: 12px;
  margin-top: 12px;
  border: 1px solid ${props => props.isCorrect ? '#4caf50' : '#f44336'};
  border-radius: ${defaultBorderRadius};
  background-color: ${props => props.isCorrect ? '#4caf5020' : '#f4433620'};
  color: ${vscForeground};
`;

const ResultHeader = styled.div<{ isCorrect: boolean }>`
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 600;
  color: ${props => props.isCorrect ? '#4caf50' : '#f44336'};
`;

const ResultIcon = styled.span`
  margin-right: 6px;
  font-size: 16px;
`;

const UserAnswerSection = styled.div`
  margin-bottom: 8px;
`;

const UserAnswerLabel = styled.div`
  font-size: 11px;
  font-weight: 500;
  color: ${lightGray};
  margin-bottom: 4px;
`;

const UserAnswerText = styled.div`
  font-size: 12px;
  padding: 8px;
  background-color: #1a1a1a; /* 深色背景 */
  border-radius: ${defaultBorderRadius};
  border: 1px solid ${lightGray}33;
`;

const RemarksSection = styled.div`
  font-size: 12px;
  line-height: 1.4;
  color: ${vscForeground};
`;

const RetrySection = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 12px;
`;

const RetryButton = styled.button`
  padding: 6px 12px;
  background-color: ${vscButtonBackground};
  color: ${vscForeground};
  border: none;
  border-radius: ${defaultBorderRadius};
  cursor: pointer;
  font-size: 12px;
  
  &:hover {
    brightness: 1.2;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// Remove the custom SubmitButton and use the same pattern as RequirementDisplayToolbar

interface KnowledgeCardSAQProps {
  question: string; // The question stem
  onSubmitAnswer: (answer: string) => void;
  placeholder?: string;
  isLoading?: boolean;
  result?: {
    userAnswer: string;
    isCorrect: boolean;
    remarks: string;
  };
  // 新增：用于保持输入状态的属性
  initialContent?: string;
  initialIsRetrying?: boolean;
  onContentChange?: (content: string) => void;
  onRetryStateChange?: (isRetrying: boolean) => void;
}

const KnowledgeCardSAQ: React.FC<KnowledgeCardSAQProps> = ({
  question,
  onSubmitAnswer,
  placeholder = "在此输入你的答案...",
  isLoading = false,
  result,
  initialContent,
  initialIsRetrying = false,
  onContentChange,
  onRetryStateChange,
}) => {
  const logger = useCodeAwareLogger();
  const [isRetrying, setIsRetrying] = React.useState(initialIsRetrying);
  const [lastResultHash, setLastResultHash] = React.useState<string>('');
  
  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent || `<p>${placeholder}</p>`,
    editorProps: {
      attributes: {
        class: "prose dark:prose-invert prose-sm sm:prose-base",
      },
    },
    onUpdate: ({ editor }) => {
      // 当编辑器内容变化时，通知父组件保存状态
      if (onContentChange) {
        const content = editor.getText();
        onContentChange(content);
      }
    },
  });

  // Reset retry state only when a genuinely new result comes in
  React.useEffect(() => {
    if (result && result.userAnswer) {
      const currentResultHash = `${result.userAnswer}-${result.isCorrect}-${result.remarks}`;
      if (currentResultHash !== lastResultHash && !isLoading) {
        setLastResultHash(currentResultHash);
        if (isRetrying) {
          setIsRetrying(false);
          // 通知父组件重试状态变化
          if (onRetryStateChange) {
            onRetryStateChange(false);
          }
        }
      }
    }
  }, [result, isLoading, isRetrying, lastResultHash, onRetryStateChange]);

  if (!editor) {
    return null;
  }

  const handleSubmit = async () => {
    const answer = editor.getText();
    if (answer.trim() && !isLoading) {
      await logger.addLogEntry("user_submit_saq_answer", {
        question: question.substring(0, 200),
        answer: answer.substring(0, 500),
        timestamp: new Date().toISOString()
      });
      
      onSubmitAnswer(answer);
      // Note: Don't reset isRetrying here, let the parent component handle result updates
    }
  };

  const handleRetry = async () => {
    console.log('Retry button clicked', { result: result?.userAnswer });
    
    await logger.addLogEntry("user_retry_saq_answer", {
      question: question.substring(0, 200),
      previousAnswer: result?.userAnswer || "",
      timestamp: new Date().toISOString()
    });
    
    setIsRetrying(true);
    // 通知父组件更新重试状态
    if (onRetryStateChange) {
      onRetryStateChange(true);
    }
    
    // 将之前的答案同步到编辑器
    if (result?.userAnswer) {
      editor.commands.setContent(result.userAnswer);
      console.log('Content set to editor:', result.userAnswer);
      // 通知父组件内容变化
      if (onContentChange) {
        onContentChange(result.userAnswer);
      }
    }
  };

  // Check if editor is effectively empty (only contains placeholder or whitespace)
  const isEditorEmpty = !editor.getText().trim() || editor.getText().trim() === placeholder;

  // If there's a result and user is not retrying, show result
  // Also show result if loading (to maintain the result view during submission)
  const showResult = result && result.userAnswer && !isRetrying && !isLoading;
  const showEditor = !showResult; // Show editor when no result or when retrying or when loading

  return (
    <SAQContainer>
      <QuestionSection>
        <QuestionText>{question}</QuestionText>
      </QuestionSection>
      
      {showEditor && (
        <>
          <EditorWrapper>
            <EditorContent editor={editor} />
          </EditorWrapper>
          <SubmitSection>
            <HoverItem>
              {isLoading ? (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <LoadingSpinner />
                  <span style={{ fontSize: '12px', color: lightGray }}>评估中...</span>
                </div>
              ) : (
                <PaperAirplaneIcon
                  className={`w-5 h-5 ${(isEditorEmpty || isLoading) ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-125 cursor-pointer'}`}
                  onClick={(!isEditorEmpty && !isLoading) ? handleSubmit : undefined}
                  aria-label="提交答案"
                >
                  <ToolTip text="提交答案" position="top">
                    提交答案
                  </ToolTip>
                </PaperAirplaneIcon>
              )}
            </HoverItem>
          </SubmitSection>
        </>
      )}

      {showResult && (
        <ResultSection isCorrect={result.isCorrect}>
          <ResultHeader isCorrect={result.isCorrect}>
            <ResultIcon>{result.isCorrect ? '✅' : '❌'}</ResultIcon>
            {result.isCorrect ? '回答正确' : '回答需要改进'}
          </ResultHeader>
          
          <UserAnswerSection>
            <UserAnswerLabel>你的回答：</UserAnswerLabel>
            <UserAnswerText>{result.userAnswer}</UserAnswerText>
          </UserAnswerSection>

          <RemarksSection>
            <strong>评语：</strong>
            {result.remarks}
          </RemarksSection>

          {/* 只有在答错的情况下才显示重试按钮 */}
          {!result.isCorrect && (
            <RetrySection>
              <RetryButton onClick={handleRetry} disabled={isLoading}>
                重新作答
              </RetryButton>
            </RetrySection>
          )}
        </ResultSection>
      )}
    </SAQContainer>
  );
};

export default KnowledgeCardSAQ;