import { ChatBubbleLeftRightIcon, PlusIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import React from 'react';
import { ToolTip } from '../../../../components/gui/Tooltip'; // Assuming ToolTip is in this path

interface KnowledgeCardToolBarProps {
  title: string;
  onQuestionClick?: () => void;
  onChatClick?: () => void;
  onAddToCollectionClick?: () => void;
}

const KnowledgeCardToolBar: React.FC<KnowledgeCardToolBarProps> = ({
  title,
  onQuestionClick,
  onChatClick, // use UseNavigate to navigate to the chat page
  onAddToCollectionClick,
}) => {
  return (
    <div className="w-full px-4 py-1 flex justify-between items-center bg-gray-800 text-gray-100">
      {/* Title */}
      <span className="font-medium text-sm truncate pr-2" title={title}>
        {title}
      </span>

      {/* Button Group */}
      <div className="flex items-center space-x-1 shrink-0">
        <ToolTip text="Test Your Mastery" position="top">
          <button
            onClick={onQuestionClick}
            className="p-1 text-gray-400 hover:text-gray-100 hover:bg-gray-700 rounded transition-colors duration-150 ease-in-out"
            aria-label="More information"
          >
            <QuestionMarkCircleIcon className="h-5 w-5" />
          </button>
        </ToolTip>

        
        <ToolTip text="Discuss more" position="top">
          <button
            onClick={onChatClick}
            className="p-1 text-gray-400 hover:text-gray-100 hover:bg-gray-700 rounded transition-colors duration-150 ease-in-out"
            aria-label="Discuss more"
          >
            <ChatBubbleLeftRightIcon className="h-5 w-5" />
          </button>
        </ToolTip>

        <ToolTip text="Mark as keypoint" position="top">
          <button
            onClick={onAddToCollectionClick}
            className="p-1 text-gray-400 hover:text-gray-100 hover:bg-gray-700 rounded transition-colors duration-150 ease-in-out"
            aria-label="Mark as keypoint"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        </ToolTip>
      </div>
    </div>
  );
};

export default KnowledgeCardToolBar;