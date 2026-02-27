import { ArrowLeftIcon, ArrowRightIcon } from "@heroicons/react/24/outline";

interface NavigationButtonsProps {
  onJumpToSemantic: () => void; // 右箭头：代码 → 语义
  onJumpToCode: () => void; // 左箭头：语义 → 代码
  isLoading?: boolean; // 查找中状态
  disabled?: boolean;
}

export function NavigationButtons({
  onJumpToSemantic,
  onJumpToCode,
  isLoading = false,
  disabled = false,
}: NavigationButtonsProps) {
  const buttonBaseClasses =
    "flex items-center justify-center rounded border px-3 py-1.5 text-xs transition-all";
  const buttonEnabledClasses =
    "border-gray-600 bg-[#0b1224] text-gray-100 hover:bg-[#111a30] hover:brightness-125 cursor-pointer";
  const buttonDisabledClasses =
    "border-gray-700 bg-gray-800 text-gray-500 cursor-not-allowed opacity-50";

  const getButtonClasses = () => {
    return `${buttonBaseClasses} ${
      disabled || isLoading ? buttonDisabledClasses : buttonEnabledClasses
    }`;
  };

  return (
    <div className="flex items-center gap-2">
      {/* 左箭头按钮：跳转到代码 */}
      <button
        className={getButtonClasses()}
        onClick={onJumpToCode}
        disabled={disabled || isLoading}
        title="跳转到代码 (Ctrl/Cmd + ←)"
      >
        <ArrowLeftIcon className="mr-1.5 h-3.5 w-3.5" />
        <span>跳转到代码</span>
      </button>

      {/* 右箭头按钮：跳转到语义 */}
      <button
        className={getButtonClasses()}
        onClick={onJumpToSemantic}
        disabled={disabled || isLoading}
        title="跳转到语义 (Ctrl/Cmd + →)"
      >
        <span>跳转到语义</span>
        <ArrowRightIcon className="ml-1.5 h-3.5 w-3.5" />
      </button>

      {/* Loading 状态指示器 */}
      {isLoading && (
        <div className="flex items-center text-xs text-gray-400">
          <svg
            className="mr-1.5 h-3.5 w-3.5 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <span>查找中...</span>
        </div>
      )}
    </div>
  );
}
