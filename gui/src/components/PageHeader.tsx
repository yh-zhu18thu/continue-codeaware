import {
  ChatBubbleLeftRightIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/24/outline";

export interface PageHeaderProps {
  onTitleClick?: () => void;
  title?: string;
  showBorder?: boolean;
  rightContent?: React.ReactNode;
  /** Unified action callbacks (replace old onGlobalQuestion) */
  onGlobalConfusion?: () => void;
  onGlobalPins?: () => void;
  showActionButtons?: boolean;
  pinCount?: number;
}

export function PageHeader({
  onTitleClick,
  title,
  rightContent,
  onGlobalConfusion,
  onGlobalPins,
  showActionButtons = false,
  pinCount = 0,
}: PageHeaderProps) {
  const actionBtnClass =
    "flex items-center justify-center w-7 h-7 rounded border-none bg-transparent text-vsc-foreground cursor-pointer transition-all duration-150 ease-in-out hover:bg-vsc-input-background focus:outline focus:outline-1 focus:outline-vsc-foreground focus:outline-offset-1";

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
        {showActionButtons && (
          <>
            {onGlobalConfusion && (
              <button
                onClick={onGlobalConfusion}
                className={actionBtnClass}
                title="我有疑惑"
              >
                <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" />
              </button>
            )}
            {onGlobalPins && (
              <button
                onClick={onGlobalPins}
                className={`${actionBtnClass} relative`}
                title="标记列表"
              >
                <QuestionMarkCircleIcon className="h-3.5 w-3.5" />
                {pinCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-blue-600 px-0.5 text-[9px] font-bold leading-none text-white">
                    {pinCount}
                  </span>
                )}
              </button>
            )}
          </>
        )}
        {rightContent}
      </div>
    </div>
  );
}
