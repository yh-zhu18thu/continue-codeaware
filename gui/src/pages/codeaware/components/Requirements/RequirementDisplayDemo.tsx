import { RequirementChunk } from "core";
import { useAppDispatch } from "../../../../redux/hooks";
import {
    submitRequirementContent,
    toggleRequirementChunkHighlight,
    updateRequirementHighlightChunks,
} from "../../../../redux/slices/codeAwareSlice";

export const RequirementDisplayDemo = () => {
  const dispatch = useAppDispatch();

  const sampleRequirement = `Create a web application that allows users to manage their personal todo lists. The application should have user authentication, allowing users to register and login securely. Each user should be able to create, edit, and delete their own todo items. The todo items should support categories and due dates. The application should also provide a dashboard view showing task statistics.`;

  const sampleHighlightChunks: RequirementChunk[] = [
    {
      id: "chunk-1",
      content: "web application",
      isHighlighted: false,
    },
    {
      id: "chunk-2", 
      content: "user authentication",
      isHighlighted: false,
    },
    {
      id: "chunk-3",
      content: "create, edit, and delete",
      isHighlighted: false,
    },
    {
      id: "chunk-4",
      content: "todo items",
      isHighlighted: true,
    },
    {
      id: "chunk-5",
      content: "dashboard view",
      isHighlighted: false,
    },
  ];

  const handleSetupDemo = () => {
    dispatch(submitRequirementContent(sampleRequirement));
    dispatch(updateRequirementHighlightChunks(sampleHighlightChunks));
  };

  const handleToggleChunk = (chunkId: string) => {
    dispatch(toggleRequirementChunkHighlight(chunkId));
  };

  const handleHighlightAll = () => {
    const highlightedChunks = sampleHighlightChunks.map(chunk => ({
      ...chunk,
      isHighlighted: true,
    }));
    dispatch(updateRequirementHighlightChunks(highlightedChunks));
  };

  const handleClearHighlights = () => {
    const clearedChunks = sampleHighlightChunks.map(chunk => ({
      ...chunk,
      isHighlighted: false,
    }));
    dispatch(updateRequirementHighlightChunks(clearedChunks));
  };

  return (
    <div className="p-4 border rounded-lg mb-4 bg-gray-100">
      <h3 className="text-lg font-semibold mb-3">RequirementDisplay Demo Controls</h3>
      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={handleSetupDemo}
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Setup Demo Data
        </button>
        <button
          onClick={handleHighlightAll}
          className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Highlight All
        </button>
        <button
          onClick={handleClearHighlights}
          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Clear Highlights
        </button>
      </div>
      <div className="mb-3">
        <h4 className="text-md font-medium mb-2">Toggle Individual Chunks:</h4>
        <div className="flex flex-wrap gap-2">
          {sampleHighlightChunks.map((chunk) => (
            <button
              key={chunk.id}
              onClick={() => handleToggleChunk(chunk.id)}
              className="px-2 py-1 text-sm bg-gray-300 text-black rounded hover:bg-gray-400"
            >
              {chunk.content}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-gray-600">
        Use these controls to test the highlight functionality. Click "Setup Demo Data" first, 
        then use other buttons to see highlighting effects with flickering animations.
      </p>
    </div>
  );
};

export default RequirementDisplayDemo;
