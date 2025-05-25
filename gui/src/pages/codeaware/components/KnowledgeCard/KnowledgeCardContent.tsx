import StyledMarkdownPreview from "../../../../components/markdown/StyledMarkdownPreview";

interface KnowledgeCardContentProps {
  markdownContent: string;
}

const KnowledgeCardContent: React.FC<KnowledgeCardContentProps> = ({
  markdownContent,
}) => {
  return (
    <div className="w-full bg-vscode-editor-background text-vscode-editor-foreground p-3 rounded-md shadow my-1 text-sm">
      <StyledMarkdownPreview
        source={markdownContent}
        useParentBackgroundColor={true}
      />
    </div>
  );
};

export default KnowledgeCardContent;