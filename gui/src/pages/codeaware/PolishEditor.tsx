// src/components/PolishEditor.tsx
import { VSCodeButton, VSCodeTextArea } from '@vscode/webview-ui-toolkit/react';
import { escapeRegExp } from 'lodash';
import { useState } from 'react';

interface PolishEditorProps {
  label: string;
  value: string;
  loading: boolean;
  className: string;
  highlightKeywords?: string[];
  onChange: (value: string) => void;
  onPolish: () => void;
}

function PolishEditor({
  label,
  value,
  loading,
  className,
  highlightKeywords = [],
  onChange,
  onPolish,
}: PolishEditorProps) {
  const handlePolish = async () => {
    await onPolish();
  };

  const [rows, setRows] = useState(4);

  const handleInput = (text: string) => {
      onChange(text);
      //CATODO: 找一个自动调整高度的方法
      const lineCount = text.split('\n').length;
      setRows(Math.max(4, lineCount)); // Minimum 2 rows
    };


  const highlightText = (text: string) => {
    if (!highlightKeywords.length) return text;

    const regex = new RegExp(
      `(${highlightKeywords.map(k => escapeRegExp(k)).join('|')})`,
      'gi'
    );

    return text.split(regex).map((chunk, i) => {
      const isKeyword = highlightKeywords.some(
        k => k.toLowerCase() === chunk.toLowerCase()
      );
      return isKeyword ? (
        <mark key={i} className="highlight">
          {chunk}
        </mark>
      ) : (
        chunk
      );
    });
  };



  return (
    <div className={`editor-container ${ className || ''}`}>
      <div className="editor-header">
        <label>{label}</label>
        <VSCodeButton
          onClick={handlePolish}
          disabled={loading}
          className="polish-button"
        >
          {loading ? (
            <span className="loading-dots">润色中</span>
          ) : (
            'AI润色'
          )}
        </VSCodeButton>
      </div>
      <VSCodeTextArea
        value={value}
        rows={rows}
        disabled={loading}
        onInput={() => handleInput(value)}
        className="editor-textarea"
      />
    </div>
  );
};

export default PolishEditor;
