// filepath: /Users/thuzyh/Documents/hci/CodeAware/dev/CodeAware/gui/src/pages/codeaware/components/Steps/Step.tsx
import React from 'react';
import KnowledgeCard, { KnowledgeCardProps } from '../KnowledgeCard/KnowledgeCard';
import StepDescription from './StepDescription';
import StepTitleBar from './StepTitleBar';

interface StepProps {
  title: string;
  description: string;
  knowledgeCards: KnowledgeCardProps[];
  isActive?: boolean;
}

const Step: React.FC<StepProps> = ({
  title,
  description,
  knowledgeCards,
  isActive = false,
}) => {
  return (
    <div className="w-full flex flex-col bg-vscode-sideBar-background">
      <StepTitleBar title={title} isActive={isActive} />
      <div className="p-4 space-y-4"> {/* Added padding and vertical spacing for content area */}
        <StepDescription markdownContent={description} />
        {knowledgeCards.map((cardProps, index) => (
          <div key={index} className="my-2"> {/* Added margin for spacing between cards */}
            <KnowledgeCard {...cardProps} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default Step;
