import React, { useEffect, useRef } from "react";
import { Input } from "../ui/input";

interface InlineRenameInputProps {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
  placeholder?: string;
  variant?: "plain" | "ui";
  selectOnMount?: boolean;
  stopClickPropagation?: boolean;
}

/**
 * Shared inline rename input supporting Enter/blur commit and Escape cancellation
 * while guarding against double-commit when Escape unmounts the input.
 */
export const InlineRenameInput: React.FC<InlineRenameInputProps> = ({
  value,
  onChange,
  onCommit,
  onCancel,
  className,
  style,
  ariaLabel,
  placeholder,
  variant = "plain",
  selectOnMount = true,
  stopClickPropagation = true,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    settledRef.current = false;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (selectOnMount) {
      el.select();
    }
  }, [selectOnMount]);

  const handleCommit = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCommit();
  };

  const handleCancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel();
  };

  const sharedProps: React.InputHTMLAttributes<HTMLInputElement> = {
    type: "text",
    className,
    style,
    value,
    placeholder,
    "aria-label": ariaLabel,
    onChange: (e) => onChange(e.target.value),
    onBlur: handleCommit,
    onKeyDown: (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        handleCommit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    },
    onClick: stopClickPropagation ? (e) => e.stopPropagation() : undefined,
    onMouseDown: stopClickPropagation ? (e) => e.stopPropagation() : undefined,
  };

  if (variant === "ui") {
    return <Input ref={inputRef} {...sharedProps} />;
  }

  return <input ref={inputRef} {...sharedProps} />;
};
