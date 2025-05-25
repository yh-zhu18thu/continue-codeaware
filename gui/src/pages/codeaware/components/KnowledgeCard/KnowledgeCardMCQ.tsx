import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import React, { useState } from 'react';

interface KnowledgeCardMCQProps {
  question: string;
  options: string[]; // 期望有4个选项
  correctAnswer: string; // 正确答案的文本
  onSubmit: (isCorrect: boolean, selectedOption: string) => void;
}

const KnowledgeCardMCQ: React.FC<KnowledgeCardMCQProps> = ({
  question,
  options,
  correctAnswer,
  onSubmit,
}) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const handleOptionClick = (option: string) => {
    if (submitted) return; // 提交后不允许更改
    setSelectedOption(option);
  };

  const handleSubmit = () => {
    if (!selectedOption) return;

    const correct = selectedOption === correctAnswer;
    setIsCorrect(correct);
    setSubmitted(true);
    onSubmit(correct, selectedOption);
  };

  const getOptionButtonClass = (option: string) => {
    const baseClasses = "rounded-lg p-3 w-full text-left border transition-all duration-300 ease-in-out transform focus:outline-none text-sm"; // 统一使用 text-sm
    
    // VSCode 风格的颜色变量 (假设这些 CSS 变量已在项目中定义)
    // 如果未定义，可以使用 Tailwind 的标准颜色，例如 bg-gray-700, text-gray-200 等
    const defaultBg = "bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground";
    const defaultText = "text-vscode-editor-foreground";
    const defaultBorder = "border-vscode-contrastBorder";

    const selectedBg = "bg-vscode-button-background hover:bg-vscode-button-hoverBackground"; // 例如蓝色调
    const selectedText = "text-vscode-button-foreground"; // 例如白色
    const selectedBorder = "border-vscode-focusBorder"; // 例如亮蓝色边框
    const selectedTransform = "scale-105 shadow-lg";

    const correctBg = "bg-green-500 hover:bg-green-600"; // 绿色背景表示正确
    const correctText = "text-white";
    const correctBorder = "border-green-700";

    const incorrectBg = "bg-red-500 hover:bg-red-600"; // 红色背景表示错误
    const incorrectText = "text-white";
    const incorrectBorder = "border-red-700";

    const disabledOpacity = "opacity-70 cursor-not-allowed";

    if (submitted) {
      const isThisOptionCorrect = option === correctAnswer;
      const isThisOptionSelected = option === selectedOption;

      if (isThisOptionCorrect) {
        return `${baseClasses} ${correctBg} ${correctText} ${correctBorder} ${isThisOptionSelected ? selectedTransform : ''}`;
      }
      if (isThisOptionSelected) { // 意味着选错了
        return `${baseClasses} ${incorrectBg} ${incorrectText} ${incorrectBorder} ${selectedTransform}`;
      }
      return `${baseClasses} ${defaultBg} ${defaultText} ${defaultBorder} ${disabledOpacity}`; // 未选中的其他错误选项
    }

    if (option === selectedOption) {
      return `${baseClasses} ${selectedBg} ${selectedText} ${selectedBorder} ${selectedTransform}`;
    }

    return `${baseClasses} ${defaultBg} ${defaultText} ${defaultBorder}`;
  };


  return (
    <div className="mt-2 w-full p-4 border rounded-md bg-vscode-editor-background text-vscode-editor-foreground">
      <p className="mb-6 text-base font-semibold">{question}</p> {/* 调整了 mb 和 text 大小 */}
      
      <div className="space-y-3 mb-6"> {/* 调整了间距 */}
        {options.map((option, index) => (
          <button
            key={index}
            onClick={() => handleOptionClick(option)}
            disabled={submitted}
            className={getOptionButtonClass(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={!selectedOption || submitted}
          className="p-2 bg-vscode-button-background text-vscode-button-foreground rounded-md hover:bg-vscode-button-hoverBackground disabled:opacity-50 flex items-center text-sm" // 使用vscode主题颜色
        >
          <PaperAirplaneIcon className="mr-2 h-4 w-4" />
          提交答案
        </button>
      </div>
    </div>
  );
};

export default KnowledgeCardMCQ;

