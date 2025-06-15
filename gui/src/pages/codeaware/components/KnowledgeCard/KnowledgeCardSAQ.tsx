import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import React from 'react';
import styled from "styled-components";
import {
  defaultBorderRadius,
  lightGray,
  vscButtonBackground,
  vscForeground,
  vscInputBackground
} from "../../../../components";
import { ToolTip } from "../../../../components/gui/Tooltip";
import HoverItem from "../../../../components/mainInput/InputToolbar/HoverItem";

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
  background-color: ${vscInputBackground};
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
  background-color: ${vscInputBackground};
  color: ${vscForeground};
  margin-bottom: 12px;
  
  .ProseMirror {
    min-height: 60px;
    width: 100%;
    padding: 10px;
    font-size: 12px;
    outline: none;
    text-align: left; /* Keep editor content left-aligned for typing */
    
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

// Remove the custom SubmitButton and use the same pattern as RequirementDisplayToolbar

interface KnowledgeCardSAQProps {
  question: string; // The question stem
  onSubmitAnswer: (answer: string) => void;
  placeholder?: string;
}

const KnowledgeCardSAQ: React.FC<KnowledgeCardSAQProps> = ({
  question,
  onSubmitAnswer,
  placeholder = "在此输入你的答案...",
}) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: `<p>${placeholder}</p>`,
    editorProps: {
      attributes: {
        class: "prose dark:prose-invert prose-sm sm:prose-base",
      },
    },
  });

  if (!editor) {
    return null;
  }

  const handleSubmit = () => {
    const answer = editor.getText();
    if (answer.trim()) {
      onSubmitAnswer(answer);
    }
  };

  return (
    <SAQContainer>
      <QuestionSection>
        <QuestionText>{question}</QuestionText>
      </QuestionSection>
      <EditorWrapper>
        <EditorContent editor={editor} />
      </EditorWrapper>
      <SubmitSection>
        <HoverItem>
          <PaperAirplaneIcon
            className={`w-5 h-5 ${editor.isEmpty ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-125 cursor-pointer'}`}
            onClick={!editor.isEmpty ? handleSubmit : undefined}
            aria-label="提交答案"
          >
            <ToolTip text="提交答案" position="top">
              提交答案
            </ToolTip>
          </PaperAirplaneIcon>
        </HoverItem>
      </SubmitSection>
    </SAQContainer>
  );
};

export default KnowledgeCardSAQ;