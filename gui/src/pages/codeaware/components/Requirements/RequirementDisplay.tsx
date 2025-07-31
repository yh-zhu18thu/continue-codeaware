import {
    Box,
    Paper,
    Step,
    StepContent,
    StepIcon,
    StepLabel,
    Stepper,
    Typography
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
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

// Custom step icon component with flickering animation
const AnimatedStepIcon = styled(StepIcon)<{ isFlickering: boolean; isHighlighted: boolean }>`
  ${props => props.isFlickering && css`
    animation: ${flicker} 0.6s ease-in-out 3;
  `}
  
  ${props => props.isHighlighted ? `
    .MuiStepIcon-root {
      color: #FFC107 !important;
    }
    .MuiStepIcon-text {
      fill: #000 !important;
    }
  ` : ''}
  
  cursor: pointer;
  transition: all 0.3s ease;
  
  &:hover {
    transform: scale(1.1);
  }
`;

// Highlighted step content styling
const HighlightedStepContent = styled(StepContent)<{ isHighlighted: boolean; isFlickering: boolean }>`
  cursor: pointer;
  transition: all 0.3s ease;
  
  .MuiStepContent-root {
    ${props => props.isHighlighted ? `
      background-color: rgba(255, 193, 7, 0.1);
      border-left: 3px solid #FFC107;
      padding-left: 1rem;
    ` : ''}
  }
  
  ${props => props.isFlickering && css`
    animation: ${flicker} 0.6s ease-in-out 3;
  `}
  
  &:hover {
    background-color: rgba(255, 193, 7, 0.05);
  }
`;

// Custom theme for Material UI components to match VS Code colors
const muiTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#FFC107',
    },
    background: {
      default: '#1e1e1e',
      paper: '#2d2d30',
    },
    text: {
      primary: '#cccccc',
      secondary: '#969696',
    },
  },
  components: {
    MuiStepLabel: {
      styleOverrides: {
        label: {
          color: '#cccccc',
          '&.Mui-active': {
            color: '#FFC107',
          },
          '&.Mui-completed': {
            color: '#cccccc',
          },
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          color: '#cccccc',
        },
      },
    },
    MuiStepConnector: {
      styleOverrides: {
        line: {
          borderColor: '#404040',
        },
      },
    },
  },
});

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

    // Create steps from highlight chunks or fallback to requirement text sections
    const createSteps = () => {
        if (!highlightChunks.length) {
            // If no highlight chunks, split requirement text by lines or sentences
            const sentences = requirementText.split(/[.!?]+/).filter(s => s.trim().length > 0);
            return sentences.map((sentence, index) => ({
                id: `sentence-${index}`,
                content: sentence.trim(),
                isHighlighted: false,
                label: `需求 ${index + 1}`,
            }));
        }

        // Sort chunks by their position in the text and create steps
        const sortedChunks = [...highlightChunks].sort((a, b) => {
            const indexA = requirementText.indexOf(a.content);
            const indexB = requirementText.indexOf(b.content);
            return indexA - indexB;
        });

        return sortedChunks.map((chunk, index) => ({
            id: chunk.id,
            content: chunk.content,
            isHighlighted: chunk.isHighlighted,
            label: `需求 ${index + 1}`,
        }));
    };

    const steps = createSteps();

    const handleStepClick = (stepId: string) => {
        handleChunkFocus();
        handleChunkClick(stepId);
    };

    const handleStepIconClick = (stepId: string) => {
        handleStepClick(stepId);
    };

    return (
        <div className="px-2.5 pb-1 pt-2">
            <DisplayContainerDiv>
                <ContentDisplayDiv>
                    <ThemeProvider theme={muiTheme}>
                        <Paper 
                            elevation={0} 
                            sx={{ 
                                backgroundColor: 'transparent',
                                padding: 0
                            }}
                        >
                            <Stepper orientation="vertical" sx={{ width: '100%' }}>
                                {steps.map((step, index) => {
                                    const isFlickering = flickeringChunks.has(step.id);
                                    const isHighlighted = step.isHighlighted;
                                    
                                    return (
                                        <Step key={step.id} active={true} completed={false}>
                                            <StepLabel
                                                StepIconComponent={(props) => (
                                                    <AnimatedStepIcon
                                                        {...props}
                                                        isFlickering={isFlickering}
                                                        isHighlighted={isHighlighted}
                                                        onClick={() => handleStepIconClick(step.id)}
                                                        onKeyDown={(e: React.KeyboardEvent) => handleChunkKeyDown(e, step.id)}
                                                        tabIndex={0}
                                                        role="button"
                                                        aria-label={`需求步骤 ${index + 1}: ${step.content}`}
                                                    />
                                                )}
                                                onClick={() => handleStepClick(step.id)}
                                                sx={{ 
                                                    cursor: 'pointer',
                                                    '&:hover': {
                                                        backgroundColor: 'rgba(255, 193, 7, 0.05)',
                                                    }
                                                }}
                                            >
                                                <Typography 
                                                    variant="h6" 
                                                    component="span"
                                                    sx={{
                                                        color: isHighlighted ? '#FFC107' : 'inherit',
                                                        fontWeight: isHighlighted ? 'bold' : 'normal',
                                                        fontSize: '14px',
                                                    }}
                                                >
                                                    {step.label}
                                                </Typography>
                                            </StepLabel>
                                            <HighlightedStepContent
                                                isHighlighted={isHighlighted}
                                                isFlickering={isFlickering}
                                                onClick={() => handleStepClick(step.id)}
                                                onKeyDown={(e: React.KeyboardEvent) => handleChunkKeyDown(e, step.id)}
                                                onBlur={handleChunkBlur}
                                                onFocus={handleChunkFocus}
                                                tabIndex={0}
                                                role="button"
                                                aria-label={`需求内容: ${step.content}`}
                                            >
                                                <Box sx={{ pb: 2 }}>
                                                    <Typography 
                                                        variant="body1"
                                                        sx={{
                                                            color: isHighlighted ? '#FFC107' : 'inherit',
                                                            lineHeight: 1.6,
                                                            fontSize: '14px',
                                                            whiteSpace: 'pre-wrap',
                                                        }}
                                                    >
                                                        {step.content}
                                                    </Typography>
                                                </Box>
                                            </HighlightedStepContent>
                                        </Step>
                                    );
                                })}
                            </Stepper>
                        </Paper>
                    </ThemeProvider>
                    
                    {/* Tool Bar */}
                    <RequirementDisplayToolBar
                        onEdit={onEdit}
                        onRegenerate={onRegenerate}
                        disabled={disabled}
                    />
                </ContentDisplayDiv>
            </DisplayContainerDiv>
        </div>
    );
}