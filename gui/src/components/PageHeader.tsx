export interface PageHeaderProps {
  onTitleClick?: () => void;
  title?: string;
  rightContent?: React.ReactNode;
}

export default function PageHeader({
  onTitleClick,
  title,
  rightContent,
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
      <div className="flex items-center gap-2">{rightContent}</div>
    </div>
  );
}
