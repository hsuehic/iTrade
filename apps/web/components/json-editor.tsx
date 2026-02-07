'use client';

import { useState } from 'react';
import { IconCheck, IconX, IconWand } from '@tabler/icons-react';

import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  readOnly?: boolean;
  className?: string;
}

export function JsonEditor({
  value,
  onChange,
  placeholder = '{}',
  minHeight = '200px',
  readOnly = false,
  className,
}: JsonEditorProps) {
  const [isValid, setIsValid] = useState(true);
  const [error, setError] = useState<string>('');
  const [localValue, setLocalValue] = useState(value);

  const validateJson = (jsonString: string) => {
    if (!jsonString.trim()) {
      setIsValid(true);
      setError('');
      return true;
    }

    try {
      JSON.parse(jsonString);
      setIsValid(true);
      setError('');
      return true;
    } catch (e) {
      setIsValid(false);
      setError(e instanceof Error ? e.message : 'Invalid JSON format');
      return false;
    }
  };

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    validateJson(newValue);
    onChange(newValue);
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(localValue);
      const formatted = JSON.stringify(parsed, null, 2);
      setLocalValue(formatted);
      onChange(formatted);
      setIsValid(true);
      setError('');
    } catch (e) {
      // Keep the current value if formatting fails
      setError(e instanceof Error ? e.message : 'Formatting failed');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isValid ? (
            <div className="flex items-center gap-1 text-xs text-green-600">
              <IconCheck className="h-3 w-3" />
              <span>Valid JSON</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-red-600">
              <IconX className="h-3 w-3" />
              <span>Invalid JSON</span>
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={formatJson}
          disabled={!isValid || readOnly}
        >
          <IconWand className="h-3 w-3 mr-1" />
          Format
        </Button>
      </div>

      <Textarea
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={cn(
          'font-mono text-sm',
          !isValid && 'border-red-500 focus-visible:ring-red-500',
          className,
        )}
        style={{ minHeight }}
        rows={10}
      />

      {error && (
        <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950 p-2 rounded">
          {error}
        </div>
      )}
    </div>
  );
}
