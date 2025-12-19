
export const processVariables = (content: string): string => {
  if (!content) return '';
  let processed = content;
  
  const replacements: Record<string, () => string> = {
    '{{timestamp}}': () => Date.now().toString(),
    '{{isoDate}}': () => new Date().toISOString(),
    '{{uuid}}': () => {
      try {
        return crypto.randomUUID();
      } catch (e) {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      }
    },
    '{{randomNum}}': () => Math.floor(Math.random() * 1000).toString(),
  };

  // 使用 split/join 替代 RegExp 避免转义字符问题
  Object.entries(replacements).forEach(([key, valueFn]) => {
    if (processed.includes(key)) {
      processed = processed.split(key).join(valueFn());
    }
  });

  return processed;
};

export const formatJSON = (content: string): string => {
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed, null, 2);
  } catch (e) {
    return content;
  }
};

export const isJSON = (content: string): boolean => {
  if (!content || typeof content !== 'string') return false;
  const trimmed = content.trim();
  if (!trimmed) return false;
  try {
    return (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) || 
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) && !!JSON.parse(trimmed);
  } catch (e) {
    return false;
  }
};
