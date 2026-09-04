import { useState } from 'react';
import { useUpdateRemark } from '../hooks/useTrackingResults';

interface RemarkCellProps {
  id: number;
  value: string | null;
}

/** Inline-editable "หมายเหตุ" cell — saves on blur, only when the text actually changed. */
export default function RemarkCell({ id, value }: RemarkCellProps) {
  const updateRemark = useUpdateRemark();
  const [text, setText] = useState(value ?? '');

  function handleBlur() {
    if (text !== (value ?? '')) {
      updateRemark.mutate({ id, remark: text.trim() || null });
    }
  }

  return (
    <input
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={handleBlur}
      onClick={(e) => e.stopPropagation()}
      placeholder="พิมพ์หมายเหตุ..."
      className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-gray-700 hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none"
    />
  );
}
