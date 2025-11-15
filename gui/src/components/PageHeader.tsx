import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";

export interface PageHeaderProps {
  onTitleClick?: () => void;
  title?: string;
  showBorder?: boolean;
  rightContent?: React.ReactNode;
  onGlobalQuestion?: () => void;
  showGlobalQuestionButton?: boolean;
}

export function PageHeader({
  onTitleClick,
  title,
  rightContent,
  onGlobalQuestion,
  showGlobalQuestionButton = false,
}: PageHeaderProps) {
  return (
    <div className="bg-vsc-background border-vsc-border sticky top-0 z-[100] flex flex-shrink-0 items-center justify-between border-b-2 px-4 py-3 shadow-md backdrop-blur-sm">
      <div className="flex items-center">
        {title && (
          <div
            className="hover:text-vsc-foreground-light cursor-pointer select-none transition-colors duration-200"
            onClick={onTitleClick}
          >
            <span className="text-vsc-foreground text-base font-bold tracking-wide">
              {title}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {showGlobalQuestionButton && onGlobalQuestion && (
          <button
            onClick={onGlobalQuestion}
            className="text-vsc-foreground hover:bg-vsc-input-background focus:outline-vsc-foreground flex h-7 w-7 cursor-pointer items-center justify-center rounded border-none bg-transparent transition-all duration-150 ease-in-out focus:outline focus:outline-1 focus:outline-offset-1"
            title="全局提问"
          >
            <QuestionMarkCircleIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {rightContent}
      </div>
    </div>
  );
}
