import { HighlightEvent } from "core";
import { useEffect, useRef, useState } from "react";
import styled, { css, keyframes } from "styled-components";
import {
    defaultBorderRadius,
    vscCommandCenterInactiveBorder,
    vscForeground,
    vscInputBackground
} from "../../../../components";
import { useAppSelector } from "../../../../redux/hooks";
import { selectRequirementHighlightChunks, selectRequirementText } from "../../../../redux/slices/codeAwareSlice";
import RequirementDisplayToolBar from "./RequirementDisplayToolbar";

// Flickering animation for highlight state changes
const flicker = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
`;

// Highlighted chunk styling
const HighlightedChunk = styled.span<{ isHighlighted: boolean; isFlickering: boolean }>`
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: all 0.3s ease;
  
  ${props => props.isHighlighted ? `
    background-color: rgba(255, 193, 7, 0.2);
    box-shadow: 0 0 8px rgba(255, 193, 7, 0.4);
    border: 1px solid rgba(255, 193, 7, 0.6);
  ` : `
    background-color: transparent;
    border: 1px solid transparent;
  `}
  
  ${props => props.isFlickering && css`
    animation: ${flicker} 0.6s ease-in-out 3;
  `}
  
  &:hover {
    background-color: rgba(255, 193, 7, 0.1);
  }
  
  &:focus {
    outline: 2px solid rgba(255, 193, 7, 0.8);
    outline-offset: 2px;
  }
`;

const DisplayContainerDiv = styled.div<{}>`
  resize: none;
  padding-bottom: 4px;
  font-family: inherit;
  border-radius: ${defaultBorderRadius};
  margin: 12px;
  height: auto;
  background-color: ${vscInputBackground};
  color: ${vscForeground};

  transition: border-color 0.15s ease-in-out;

  outline: none;
  font-size: 14px;

  display: flex;
  flex-direction: column;
  max-width: 672px; // 相当于 max-w-2xl
  margin-left: auto;
  margin-right: auto;
  margin-top: 1rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
`;

const ContentDisplayDiv = styled.div<{}>`
  max-width: none;
  min-height: 10px;
  border: 1px solid ${vscCommandCenterInactiveBorder};
  border-radius: ${defaultBorderRadius};
  padding: 1rem 1rem 0.25rem 1rem; // Reduced bottom padding from 1rem to 0.5rem
  background-color: ${vscInputBackground}; // 使用更深的背景色
  color: ${vscForeground};
  white-space: pre-wrap; // 保留换行符和空格
  line-height: 1.6;
  font-size: 14px;
`;

interface RequirementDisplayProps {
    onEdit: () => void;
    onRegenerate: () => void;
    onChunkFocus?: (highlight: HighlightEvent) => void;
    onClearHighlight?: () => void;
    disabled?: boolean; // Optional disabled state
}

export default function RequirementDisplay({
    onEdit,
    onRegenerate,
    onChunkFocus,
    onClearHighlight,
    disabled = false,
}: RequirementDisplayProps) {
    const requirementText = useAppSelector(selectRequirementText);
    const highlightChunks = useAppSelector(selectRequirementHighlightChunks);

    // Track previous highlight states for flickering animation using useRef to avoid circular dependency
    const previousHighlightStatesRef = useRef<Map<string, boolean>>(new Map());
    const [flickeringChunks, setFlickeringChunks] = useState<Set<string>>(new Set());
    const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Monitor highlight state changes and trigger flickering
    useEffect(() => {
        console.log("Highlight chunks updated:", highlightChunks);

        const newFlickering = new Set<string>();
        
        highlightChunks.forEach(chunk => {
            const previousState = previousHighlightStatesRef.current.get(chunk.id);
            if (previousState !== undefined && previousState !== chunk.isHighlighted) {
                newFlickering.add(chunk.id);
            }
        });

        if (newFlickering.size > 0) {
            setFlickeringChunks(newFlickering);
            
            // Clear flickering after animation completes
            setTimeout(() => {
                setFlickeringChunks(new Set());
            }, 1800); // 3 cycles of 0.6s animation
        }

        // Update previous states
        const newPreviousStates = new Map();
        highlightChunks.forEach(chunk => {
            newPreviousStates.set(chunk.id, chunk.isHighlighted);
        });
        previousHighlightStatesRef.current = newPreviousStates;
    }, [highlightChunks]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (blurTimeoutRef.current) {
                clearTimeout(blurTimeoutRef.current);
            }
        };
    }, []);

    const handleChunkClick = (chunkId: string) => {
        if (onChunkFocus) {
            // construct a HighlightEvent
            const highlightEvent: HighlightEvent = {
                sourceType: "requirement",
                identifier: chunkId,
            }
            onChunkFocus(highlightEvent);
        }
    };

    const handleChunkKeyDown = (event: React.KeyboardEvent, chunkId: string) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleChunkClick(chunkId);
        }
    };

    const handleChunkBlur = () => {
        // Clear any existing timeout
        if (blurTimeoutRef.current) {
            clearTimeout(blurTimeoutRef.current);
        }
        
        // Set a delay before clearing highlights to avoid immediate clearing
        // when focus moves between related elements
        blurTimeoutRef.current = setTimeout(() => {
            if (onClearHighlight) {
                onClearHighlight();
            }
        }, 200); // 200ms delay
    };

    const handleChunkFocus = () => {
        // Clear the blur timeout if chunk gets focus again
        if (blurTimeoutRef.current) {
            clearTimeout(blurTimeoutRef.current);
            blurTimeoutRef.current = null;
        }
    };

    // Render requirement text with highlighted chunks
    const renderRequirementWithHighlights = () => {
        if (!highlightChunks.length) {
            return requirementText;
        }

        // Sort chunks by their position in the text
        const sortedChunks = [...highlightChunks].sort((a, b) => {
            const indexA = requirementText.indexOf(a.content);
            const indexB = requirementText.indexOf(b.content);
            return indexA - indexB;
        });

        let result = [];
        let lastIndex = 0;

        sortedChunks.forEach((chunk) => {
            const chunkIndex = requirementText.indexOf(chunk.content, lastIndex);
            
            if (chunkIndex !== -1) {
                // Add text before this chunk
                if (chunkIndex > lastIndex) {
                    result.push(requirementText.substring(lastIndex, chunkIndex));
                }
                
                // Add the highlighted chunk
                result.push(
                    <HighlightedChunk
                        key={chunk.id}
                        isHighlighted={chunk.isHighlighted}
                        isFlickering={flickeringChunks.has(chunk.id)}
                        onClick={() => handleChunkClick(chunk.id)}
                        onKeyDown={(e) => handleChunkKeyDown(e, chunk.id)}
                        onBlur={handleChunkBlur}
                        onFocus={handleChunkFocus}
                        tabIndex={0}
                        role="button"
                        aria-label={`Requirement chunk: ${chunk.content}`}
                    >
                        {chunk.content}
                    </HighlightedChunk>
                );
                
                lastIndex = chunkIndex + chunk.content.length;
            }
        });

        // Add remaining text
        if (lastIndex < requirementText.length) {
            result.push(requirementText.substring(lastIndex));
        }

        return result;
    };

    return (
        <div className="px-2.5 pb-1 pt-2">
            <ContentDisplayDiv>
                {renderRequirementWithHighlights()}
                {/* Tool Bar */}
                <RequirementDisplayToolBar
                    onEdit={onEdit}
                    onRegenerate={onRegenerate}
                    disabled={disabled}
                />
            </ContentDisplayDiv>
        </div>
    );
}