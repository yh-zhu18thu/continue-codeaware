import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import styled from "styled-components";
import {
    defaultBorderRadius,
    vscCommandCenterActiveBorder,
    vscCommandCenterInactiveBorder,
    vscEditorBackground,
    vscForeground,
    vscInputBorderFocus
} from "../../../../components";
import StepEditToolBar from "./StepEditToolBar";

const EditorContainer = styled.div`
  border-radius: ${defaultBorderRadius};
  padding: 0.5rem;
  background-color: ${vscEditorBackground};
  color: ${vscForeground};
  font-size: 12px;
  border: 1px solid ${vscCommandCenterInactiveBorder};
  transition: border-color 0.15s ease-in-out;
  
  &:focus-within {
    border: 1px solid ${vscCommandCenterActiveBorder};
  }

  .ProseMirror {
    outline: none;
    min-height: 60px;
    
    &:focus {
      border: 0.5px solid ${vscInputBorderFocus};
      border-radius: ${defaultBorderRadius};
    }

    p {
      margin: 0.5em 0;
      
      &:first-child {
        margin-top: 0;
      }
      
      &:last-child {
        margin-bottom: 0;
      }
    }
  }
`;

interface StepEditorProps {
  markdownContent: string;
  isVisible?: boolean;
  onConfirm: (content: string) => void;
}

const StepEditor: React.FC<StepEditorProps> = ({
  markdownContent,
  isVisible = true,
  onConfirm,
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
    ],
    content: markdownContent || '<p></p>',
  });

  useEffect(() => {
    if (editor && markdownContent) {
      const currentEditorHTML = editor.getHTML();
      if (currentEditorHTML !== markdownContent) {
        editor.commands.setContent(markdownContent);
      }
    }
  }, [editor, markdownContent]);

  if (!isVisible) {
    return null;
  }

  if (!editor) {
    return <div>Loading...</div>;
  }

  return (
    <div className="px-1">
      <EditorContainer>
        <EditorContent
          editor={editor}
          className="scroll-container overflow-y-scroll max-h-[150vh]"
        />
        <StepEditToolBar
          onSubmit={() => {
            const content = editor.getText();
            onConfirm(content);
          }}
          isSubmitDisabled={editor.isEmpty}
        />
      </EditorContainer>
    </div>
  );
};

export default StepEditor;
