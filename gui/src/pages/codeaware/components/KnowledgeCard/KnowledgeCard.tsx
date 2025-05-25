import React from 'react';
import KnowledgeCardContent from './KnowledgeCardContent';
import KnowledgeCardMCQ from './KnowledgeCardMCQ';
import KnowledgeCardSAQ from './KnowledgeCardSAQ';
import KnowledgeCardToolBar from './KnowledgeCardToolBar';

export interface KnowledgeCardProps {
  // Toolbar props
  title: string;
  onQuestionMarkClick?: () => void; // Renamed from onQuestionClick for clarity
  onChatClick?: () => void;
  onAddToCollectionClick?: () => void;

  // Content props
  markdownContent: string;

  // Self-test mode and question type
  testMode?: 'mcq' | 'saq' | null; // null or undefined means not in test mode

  // MCQ specific props (conditionally required if testMode is 'mcq')
  mcqQuestion?: string;
  mcqOptions?: string[];
  mcqCorrectAnswer?: string;
  onMcqSubmit?: (isCorrect: boolean, selectedOption: string) => void;

  // SAQ specific props (conditionally required if testMode is 'saq')
  onSaqSubmit?: (answer: string) => void;
  saqPlaceholder?: string;
}

const KnowledgeCard: React.FC<KnowledgeCardProps> = ({
  title,
  markdownContent,
  onQuestionMarkClick,
  onChatClick,
  onAddToCollectionClick,
  testMode,
  mcqQuestion,
  mcqOptions,
  mcqCorrectAnswer,
  onMcqSubmit,
  onSaqSubmit,
  saqPlaceholder,
}) => {
  return (
    <div className="w-full flex flex-col rounded-lg shadow-md overflow-hidden border border-vscode-panel-border bg-vscode-editor-background">
      <KnowledgeCardToolBar
        title={title}
        onQuestionClick={onQuestionMarkClick} // Pass to the actual prop name in KnowledgeCardToolBar
        onChatClick={onChatClick}
        onAddToCollectionClick={onAddToCollectionClick}
      />
      {/* Scrollable content area */}
      <div className="flex-grow p-4 overflow-y-auto">
        <KnowledgeCardContent markdownContent={markdownContent} />

        {testMode === 'mcq' &&
          mcqQuestion &&
          mcqOptions &&
          mcqCorrectAnswer &&
          onMcqSubmit && (
            <div className="mt-4"> {/* Add margin-top for spacing */}
              <KnowledgeCardMCQ
                question={mcqQuestion}
                options={mcqOptions}
                correctAnswer={mcqCorrectAnswer}
                onSubmit={onMcqSubmit}
              />
            </div>
        )}

        {testMode === 'saq' && onSaqSubmit && (
          <div className="mt-4"> {/* Add margin-top for spacing */}
            <KnowledgeCardSAQ
              onSubmitAnswer={onSaqSubmit}
              placeholder={saqPlaceholder}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeCard;
