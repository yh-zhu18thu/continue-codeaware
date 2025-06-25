import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import styled from "styled-components";
import {
    defaultBorderRadius,
    lightGray,
    vscCommandCenterActiveBorder,
    vscCommandCenterInactiveBorder,
    vscForeground,
    vscInputBackground,
    vscInputBorderFocus
} from "../../../../components";
import { useAppSelector } from "../../../../redux/hooks";
import RequirementEditToolBar from "./RequirementEditToolBar";

const InputBoxDiv = styled.div<{}>`
  resize: none;
  padding-bottom: 4px;
  font-family: inherit;
  border-radius: ${defaultBorderRadius};
  margin: 12px;
  height: auto;
  background-color: ${vscInputBackground};
  color: ${vscForeground};

  border: 1px solid ${vscCommandCenterInactiveBorder};
  transition: border-color 0.15s ease-in-out;
  &:focus-within {
    border: 1px solid ${vscCommandCenterActiveBorder};
  }

  outline: none;
  font-size: 14px;

  &:focus {
    outline: none;

    border: 0.5px solid ${vscInputBorderFocus};
  }

  &::placeholder {
    color: ${lightGray}cc;
  }

  display: flex;
  flex-direction: column;
  position: relative;
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: ${defaultBorderRadius};
  z-index: 10;
`;

const SpinnerIcon = styled.div`
  width: 24px;
  height: 24px;
  border: 2px solid ${lightGray};
  border-top: 2px solid ${vscForeground};
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;


interface RequirementEditorProps {
    onConfirm: (requirement: string) => void;
    onAIProcess: (requirement: string) => void;
}

export default function RequirementEditor(props:RequirementEditorProps){
    const userRequirementContent = useAppSelector((state) => state.codeAwareSession.userRequirement?.requirementDescription || "");

    const userRequirementStatus = useAppSelector((state) => state.codeAwareSession.userRequirement?.requirementStatus || "empty");
    // 2. 定义占位符内容
    const placeholderContent = '<p>请输入项目需求、当前您自身的水平与学习目标</p>';

    // 3. 决定编辑器当前应该显示的内容
    const currentTargetContent = userRequirementContent || placeholderContent;

    const editor = useEditor({
        extensions: [
            StarterKit,
        ],
        content: currentTargetContent, // 4. 使用 currentTargetContent 初始化编辑器
    });

    // 5. 使用 useEffect 来监听 editor 实例和 currentTargetContent 的变化, 保证编辑器内容与内容一致
    useEffect(() => {
        if (editor) {
            const currentEditorHTML = editor.getHTML();
            // 如果编辑器当前内容与目标内容不一致，则更新
            if (currentEditorHTML !== currentTargetContent) {
                editor.commands.setContent(currentTargetContent);
            }
        }
    }, [editor, currentTargetContent]); // 依赖 editor 实例和 currentTargetContent

    if (!editor) {
        return <div>Loading...</div>; // 等待编辑器初始化
    }

    // 检查是否正在进行 AI 处理
    const isParaphrasing = userRequirementStatus === "paraphrasing";

    // 
    return (
        <InputBoxDiv>
            {/* Loading Overlay */}
            {isParaphrasing && (
                <LoadingOverlay>
                    <SpinnerIcon />
                </LoadingOverlay>
            )}
            
            {/* Editor Content */}
            <div className="px-2.5 pb-1 pt-2">
                <EditorContent
                    editor={editor}
                    className="scroll-container overflow-y-scroll max-h-[150vh]"
                />

                {/* Tool Bar */}
                <RequirementEditToolBar
                    onSubmit={() => {
                        const requirement = editor.getText();
                        props.onConfirm(requirement);
                    }}
                    onUndo={() => editor.chain().focus().undo().run()}
                    onRedo={() => editor.chain().focus().redo().run()}
                    onAIProcess={() => {
                            const requirement = editor.getText();
                            props.onAIProcess(requirement);
                    }}
                    isUndoDisabled={!editor.can().undo() || isParaphrasing}
                    isRedoDisabled={!editor.can().redo() || isParaphrasing}
                    isSubmitDisabled={editor.isEmpty || isParaphrasing}
                    isAIProcessDisabled={editor.isEmpty || isParaphrasing}
                    // isSubmitDisabled={editor.isEmpty || !editor.can().run()}
                />
            </div>
        </InputBoxDiv>
    );
}