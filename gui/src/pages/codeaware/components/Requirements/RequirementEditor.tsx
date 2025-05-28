import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import { useAppSelector } from "../../../../redux/hooks";
import RequirementEditToolBar from "./RequirementEditToolBar";


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
        <div className="relative max-w-2xl mx-auto mt-8 p-4 border rounded-2xl shadow-md bg-white">
            {/* Editor Content */}
            <EditorContent
                editor={editor}
                className="prose max-w-none min-h-[200px] border rounded-md p-4 focus:outline-none"
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
    );
}