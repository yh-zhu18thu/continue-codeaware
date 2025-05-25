import StyledMarkdownPreview from "../../../../components/markdown/StyledMarkdownPreview";

interface StepDescriptionProps {
  markdownContent: string;
}

const StepDescription: React.FC<StepDescriptionProps> = ({
  markdownContent,
}) => {
  return (
    <div className="w-full bg-vscode-editor-background text-vscode-editor-foreground p-4 rounded-lg shadow-md my-2">
      <StyledMarkdownPreview
        source={markdownContent}
        useParentBackgroundColor={true}
      />
    </div>
  );
};

export default StepDescription;