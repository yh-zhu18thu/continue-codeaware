import React, { useState } from 'react';
import styled from "styled-components";
import StepDescription from './StepDescription';
import StepTitleBar from './StepTitleBar';

const Container = styled.div`
  width: 100%;
  margin: 8px 0;
`;

interface StepContainerProps {
  title: string;
  markdownContent: string;
  isActive?: boolean;
  defaultExpanded?: boolean;
}

const StepContainer: React.FC<StepContainerProps> = ({
  title,
  markdownContent,
  isActive = false,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <Container>
      <StepTitleBar
        title={title}
        isActive={isActive}
        isExpanded={isExpanded}
        onToggle={handleToggle}
      />
      <StepDescription
        markdownContent={markdownContent}
        isVisible={isExpanded}
      />
    </Container>
  );
};

export default StepContainer;
