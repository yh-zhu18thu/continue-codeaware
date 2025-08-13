import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import React, { useState } from 'react';
import styled from "styled-components";
import {
    defaultBorderRadius,
    lightGray,
    vscButtonBackground,
    vscButtonForeground,
    vscFocusBorder,
    vscForeground
} from "../../../../components";
import { useCodeAwareLogger } from '../../../../util/codeAwareWebViewLogger';

const QuestionContainer = styled.div`
  width: 100%;
  padding: 16px;
  border: 1px solid ${lightGray}33;
  border-radius: ${defaultBorderRadius};
  background-color: #1a1a1a; /* 深色背景 */
  color: ${vscForeground};
  text-align: center; /* Center the content */
`;

const QuestionText = styled.p`
  margin-bottom: 24px;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  text-align: center; /* Center the question text */
`;

const OptionsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
`;

const OptionButton = styled.button<{ 
  isSelected: boolean; 
  isCorrect: boolean; 
  isSubmitted: boolean; 
  isWrong: boolean;
}>`
  border-radius: ${defaultBorderRadius};
  padding: 12px;
  width: 100%;
  text-align: left;
  border: 1px solid;
  transition: all 0.3s ease-in-out;
  cursor: ${({ isSubmitted }) => isSubmitted ? 'not-allowed' : 'pointer'};
  font-size: 14px;
  line-height: 1.4;
  
  ${({ isSubmitted, isCorrect, isSelected, isWrong }) => {
    if (isSubmitted) {
      if (isCorrect) {
        return `
          background-color: #22c55e;
          color: white;
          border-color: #16a34a;
          transform: ${isSelected ? 'scale(1.02)' : 'none'};
          box-shadow: ${isSelected ? '0 4px 8px rgba(34, 197, 94, 0.3)' : 'none'};
        `;
      }
      if (isWrong && isSelected) {
        return `
          background-color: #ef4444;
          color: white;
          border-color: #dc2626;
          transform: scale(1.02);
          box-shadow: 0 4px 8px rgba(239, 68, 68, 0.3);
        `;
      }
      return `
        background-color: #2a2a2a; /* 深色背景 */
        color: ${vscForeground};
        border-color: ${lightGray};
        opacity: 0.7;
      `;
    }
    
    if (isSelected) {
      return `
        background-color: ${vscButtonBackground}44;
        color: ${vscForeground};
        border-color: ${vscFocusBorder};
        transform: scale(1.02);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      `;
    }
    
    return `
      background-color: #1a1a1a; /* 深色背景 */
      color: ${vscForeground};
      border-color: ${lightGray}66;
      
      &:hover {
        background-color: #2a2a2a; /* 悬停时稍亮的深色背景 */
        border-color: ${lightGray};
      }
    `;
  }}
`;

const SubmitSection = styled.div`
  display: flex;
  justify-content: center; /* Center the submit button */
`;

const SubmitButton = styled.button`
  padding: 8px 16px;
  background-color: ${vscButtonBackground};
  color: ${vscButtonForeground};
  border: none;
  border-radius: ${defaultBorderRadius};
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.15s ease-in-out;

  &:hover:enabled {
    filter: brightness(1.1);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

interface KnowledgeCardMCQProps {
  question: string;
  options: string[]; // 期望有4个选项
  correctAnswer: string; // 正确答案的文本
  onSubmit: (isCorrect: boolean, selectedOption: string) => void;
  // 新增：用于保持输入状态的属性
  initialSelectedOption?: string;
  initialSubmitted?: boolean;
  onSelectionChange?: (selectedOption: string) => void;
  onSubmitStateChange?: (submitted: boolean) => void;
}

const KnowledgeCardMCQ: React.FC<KnowledgeCardMCQProps> = ({
  question,
  options,
  correctAnswer,
  onSubmit,
  initialSelectedOption,
  initialSubmitted = false,
  onSelectionChange,
  onSubmitStateChange,
}) => {
  const logger = useCodeAwareLogger();
  const [selectedOption, setSelectedOption] = useState<string | null>(initialSelectedOption || null);
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  const handleOptionClick = async (option: string) => {
    if (submitted) return; // 提交后不允许更改
    
    setSelectedOption(option);
    // 通知父组件选择变化
    if (onSelectionChange) {
      onSelectionChange(option);
    }
  };

  const handleSubmit = async () => {
    if (!selectedOption) return;

    const correct = selectedOption === correctAnswer;
    setIsCorrect(correct);
    setSubmitted(true);
    
    // 通知父组件提交状态变化
    if (onSubmitStateChange) {
      onSubmitStateChange(true);
    }
    
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

