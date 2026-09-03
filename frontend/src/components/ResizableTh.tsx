import type { ReactNode } from 'react';

interface ResizableThProps {
  width: number;
  align?: 'right';
  onMouseDownResize: (e: React.MouseEvent) => void;
  onClick?: () => void;
  children: ReactNode;
}

/** A <th> with a drag handle on its right edge to resize the column, shared by every data table in the app. */
export default function ResizableTh({ width, align, onMouseDownResize, onClick, children }: ResizableThProps) {
  return (
    <th
      style={{ width }}
      onClick={onClick}
      className={`relative select-none overflow-hidden px-3 py-2 ${onClick ? 'cursor-pointer hover:text-gray-700' : ''} ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>{children}</span>
      <div
        onMouseDown={(e) => {
          e.stopPropagation();
          onMouseDownResize(e);
        }}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-300 active:bg-indigo-400"
      />
    </th>
  );
}
