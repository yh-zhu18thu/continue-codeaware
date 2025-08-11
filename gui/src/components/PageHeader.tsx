import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";

export interface PageHeaderProps {
  onTitleClick?: () => void;
  title?: string;
  rightContent?: React.ReactNode;
  onGlobalQuestion?: () => void;
  showGlobalQuestionButton?: boolean;
}

export default function PageHeader({
  onTitleClick,
  title,
  rightContent,
  onGlobalQuestion,
  showGlobalQuestionButton = false,
}: PageHeaderProps) {
  return (
    <div className="bg-vsc-background sticky top-0 z-[100] flex items-center justify-between border-b-2 border-vsc-border px-4 py-3 shadow-md backdrop-blur-sm flex-shrink-0">
      <div className="flex items-center">
        {title && (
          <div
            className="cursor-pointer select-none transition-colors duration-200 hover:text-vsc-foreground-light"
            onClick={onTitleClick}
          >
            <span className="text-base font-bold text-vsc-foreground tracking-wide">
              {title}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {showGlobalQuestionButton && onGlobalQuestion && (
          <button
            onClick={onGlobalQuestion}
            className="flex items-center justify-center w-7 h-7 rounded border-none bg-transparent text-vsc-foreground cursor-pointer transition-all duration-150 ease-in-out hover:bg-vsc-input-background focus:outline focus:outline-1 focus:outline-vsc-foreground focus:outline-offset-1"
            title="全局提问"
          >
            <QuestionMarkCircleIcon className="w-3.5 h-3.5" />
          </button>
        )}
        {rightContent}
      </div>
    </div>
  );
}
