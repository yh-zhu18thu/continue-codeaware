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
`;


interface RequirementEditorProps {
    onConfirm: (requirement: string) => void;
    onAIProcess: (requirement: string) => void;
}

export default function RequirementEditor(props:RequirementEditorProps){
    const userRequirementContent = useAppSelector((state) => state.codeAwareSession.userRequirement?.requirementDescription || "");
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



    // 
    return (
        <InputBoxDiv>
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
                    isUndoDisabled={!editor.can().undo()}
                    isRedoDisabled={!editor.can().redo()}
                    isSubmitDisabled={editor.isEmpty}
                    isAIProcessDisabled={editor.isEmpty}
                    // isSubmitDisabled={editor.isEmpty || !editor.can().run()}
                />
            </div>
        </InputBoxDiv>
    );
}