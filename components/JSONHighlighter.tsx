
import React from 'react';

interface JSONHighlighterProps {
  content: string;
}

export const JSONHighlighter: React.FC<JSONHighlighterProps> = ({ content }) => {
  const highlight = (json: string) => {
    if (typeof json !== 'string') return json;

    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, (match) => {
      let cls = 'text-blue-400'; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-purple-400'; // key
        } else {
          cls = 'text-emerald-400'; // string
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-amber-400'; // boolean
      } else if (/null/.test(match)) {
        cls = 'text-slate-400'; // null
      }
      return `<span class="${cls}">${match}</span>`;
    });
  };

  return (
    <pre 
      className="code-font text-sm whitespace-pre-wrap break-all p-2 bg-slate-900/50 rounded"
      dangerouslySetInnerHTML={{ __html: highlight(content) }}
    />
  );
};
