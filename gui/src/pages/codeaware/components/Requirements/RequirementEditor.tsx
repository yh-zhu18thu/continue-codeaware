import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
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
import { useCodeAwareLogger } from "../../../../util/codeAwareWebViewLogger";
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
    onContentChange?: (hasChanges: boolean) => void; // 新增：内容变化时的回调
    disabled?: boolean; // Optional disabled state
}

export default function RequirementEditor({ onConfirm, onAIProcess, onContentChange, disabled = false }: RequirementEditorProps){
    const userRequirementContent = useAppSelector((state) => state.codeAwareSession.userRequirement?.requirementDescription || "");
    
    const userRequirementStatus = useAppSelector((state) => state.codeAwareSession.userRequirement?.requirementStatus || "empty");
    
    // CodeAware logger
    const logger = useCodeAwareLogger();
    
    // Track if user has started editing
    const hasStartedEditingRef = useRef(false);
    const editingStartTimeRef = useRef<number | null>(null);
    // 2. 定义占位符内容
    const placeholderContent = '<p>请输入项目需求、当前您自身的水平与学习目标</p>';

    // 3. 决定编辑器当前应该显示的内容
    const currentTargetContent = userRequirementContent || placeholderContent;

    const editor = useEditor({
        extensions: [
            StarterKit,
        ],
        content: currentTargetContent, // 4. 使用 currentTargetContent 初始化编辑器
        editable: !disabled, // Disable editing when disabled prop is true
        onUpdate: ({ editor }) => {
            // Log when user starts editing
            if (!hasStartedEditingRef.current) {
                hasStartedEditingRef.current = true;
                editingStartTimeRef.current = Date.now();
                
                logger.addLogEntry("user_start_editing_requirement", {
                    initialContent: currentTargetContent,
                    timestamp: new Date().toISOString()
                });
            }
            
            // Check if user has made actual changes to content
            const currentContent = editor.getText().trim();
            const originalContent = userRequirementContent.trim();
            const hasChanges = currentContent !== originalContent;
            
            // 特殊处理：如果是从empty状态开始输入，直接设置为editing状态
            if (userRequirementStatus === "empty" && currentContent.length > 0) {
                // 这将在父组件中被handleRequirementContentChange处理
            }
            
            // Notify parent component about content changes
            if (onContentChange) {
                onContentChange(hasChanges);
            }
            
            // If content has changed, log it
            if (hasChanges) {
                logger.addLogEntry("user_content_modified", {
                    originalContent,
                    currentContent,
                    timestamp: new Date().toISOString()
                });
            }
        },
        onFocus: () => {
            // Log when user focuses on the editor (if not already editing)
            if (!hasStartedEditingRef.current) {
                logger.addLogEntry("user_focus_requirement_editor", {
                    timestamp: new Date().toISOString()
                });
            }
        }
    });

        // 5. 使用 useEffect 监听用户需求状态的变化，确保编辑器内容同步更新
    useEffect(() => {
        if (editor && currentTargetContent !== editor.getHTML()) {
            editor.commands.setContent(currentTargetContent);
        }
    }, [userRequirementContent, editor, currentTargetContent]);

    // Update editor editable state when disabled prop changes
    useEffect(() => {
        if (editor) {
            editor.setEditable(!disabled);
        }
    }, [disabled, editor]);

    if (!editor) {
        return <div>Loading...</div>; // 等待编辑器初始化
    }

    // 检查是否正在进行 AI 处理
    const isParaphrasing = userRequirementStatus === "paraphrasing";
    
    // 更简单的逻辑：只有当状态是"ai_processed"时，才允许提交
    const hasContent = editor && editor.getText().trim().length > 0;
    const canSubmit = userRequirementStatus === "ai_processed" && hasContent;
    
    // 如果有内容但不在AI处理过的状态，就需要AI处理
    const needsAIProcessing = hasContent && userRequirementStatus !== "ai_processed" && !isParaphrasing;

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
                        if (disabled) return;
                        const requirement = editor.getText();
                        onConfirm(requirement);
                    }}
                    onUndo={() => {
                        if (disabled) return;
                        editor.chain().focus().undo().run();
                    }}
                    onRedo={() => {
                        if (disabled) return;
                        editor.chain().focus().redo().run();
                    }}
                    onAIProcess={() => {
                        if (disabled) return;
                        const requirement = editor.getText();
                        onAIProcess(requirement);
                    }}
                    isUndoDisabled={!editor.can().undo() || isParaphrasing || disabled}
                    isRedoDisabled={!editor.can().redo() || isParaphrasing || disabled}
                    isSubmitDisabled={!canSubmit || isParaphrasing || disabled}
                    isAIProcessDisabled={editor.isEmpty || isParaphrasing || disabled}
                    needsAIProcessing={needsAIProcessing}
                    // isSubmitDisabled={editor.isEmpty || !editor.can().run()}
                />
            </div>
        </InputBoxDiv>
    );
}