import { PaperAirplaneIcon } from "@heroicons/react/24/outline"; // 从 heroicons 导入
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

interface KnowledgeCardSAQProps {
  onSubmitAnswer: (answer: string) => void;
  placeholder?: string;
}

const KnowledgeCardSAQ: React.FC<KnowledgeCardSAQProps> = ({
  onSubmitAnswer,
  placeholder = "在此输入你的答案...",
}) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: `<p>${placeholder}</p>`,
    editorProps: {
      attributes: {
        class:
          "prose dark:prose-invert prose-sm sm:prose-base min-h-[80px] w-full rounded-md border border-input bg-vscode-input-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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
      //   editor.commands.clearContent(); // 可选：提交后清空编辑器
    }
  };

  return (
    <div className="mt-2 w-full">
      <EditorContent editor={editor} />
      <div className="mt-2 flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={editor.isEmpty}
          className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 flex items-center" // 更新样式
        >
          <PaperAirplaneIcon className="mr-2 h-4 w-4" /> {/* 替换图标 */}
          提交答案
        </button>
      </div>
    </div>
  );
};

export default KnowledgeCardSAQ;