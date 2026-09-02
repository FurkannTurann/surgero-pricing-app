
import React, { useState, KeyboardEvent } from 'react';

interface TagInputProps {
  label: string;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  id?: string;
}

export const TagInput: React.FC<TagInputProps> = ({ label, tags, onTagsChange, id }) => {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === ',' || e.key === 'Enter') && inputValue.trim()) {
      e.preventDefault();
      const newTag = inputValue.trim();
      if (!tags.includes(newTag)) {
        onTagsChange([...tags, newTag]);
      }
      setInputValue('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    onTagsChange(tags.filter(tag => tag !== tagToRemove));
  };

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-300 mb-1">
        {label}
      </label>
      <div className="flex flex-wrap items-center w-full px-3 py-2 border border-slate-600 bg-slate-700 rounded-md shadow-sm">
        {tags.map(tag => (
          <div key={tag} className="flex items-center bg-teal-500/20 text-teal-300 text-sm font-medium mr-2 mb-1 px-2.5 py-0.5 rounded-full">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-2 text-teal-400 hover:text-teal-200"
            >
              &times;
            </button>
          </div>
        ))}
        <input
          id={id}
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-grow bg-transparent border-none focus:ring-0 text-sm placeholder:text-slate-400"
          placeholder="Add tags..."
        />
      </div>
    </div>
  );
};