import React from 'react';
import styled, { keyframes } from 'styled-components';
import { vscForeground } from '../../../../components';

const bounce = keyframes`
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1.0);
  }
`;

const LoaderContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px 20px;
  flex-direction: column;
  gap: 16px;
`;

const LoaderText = styled.div`
  color: ${vscForeground};
  font-size: 14px;
  opacity: 0.7;
`;

const DotsContainer = styled.div`
  display: flex;
  gap: 4px;
`;

const Dot = styled.div<{ delay: number }>`
  width: 8px;
  height: 8px;
  background-color: ${vscForeground};
  border-radius: 50%;
  animation: ${bounce} 1.4s infinite ease-in-out both;
  animation-delay: ${props => props.delay}s;
  opacity: 0.6;
`;

interface KnowledgeCardLoaderProps {
  text?: string;
}

const KnowledgeCardLoader: React.FC<KnowledgeCardLoaderProps> = ({ 
  text = "Generating Content..." 
}) => {
  return (
    <LoaderContainer>
      <DotsContainer>
        <Dot delay={-0.32} />
        <Dot delay={-0.16} />
        <Dot delay={0} />
      </DotsContainer>
      <LoaderText>{text}</LoaderText>
    </LoaderContainer>
  );
};

export default KnowledgeCardLoader;
