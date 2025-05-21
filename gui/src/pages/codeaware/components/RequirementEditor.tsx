import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import RequirementEditToolBar from "./RequirementEditToolBar";

interface RequirementEditorProps {
    onConfirm: (requirement: string) => void;
    onAIProcess: (requirement: string) => void;
}

export function RequirementEditor(props:RequirementEditorProps){

    const editor = useEditor({
        extensions: [
            StarterKit,
        ],
        content: '<p>请输入项目需求、当前您自身的水平与学习目标</p>',
    });

    if (!editor) {
        return null;
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