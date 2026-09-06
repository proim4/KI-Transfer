import type { ReactNode } from 'react';

interface ResizableThProps {
  width: number;
  /** Left offset in px for a pinned/frozen column that isn't the first one — lets several columns freeze side by side instead of all stacking at left:0. */
  left?: number;
  align?: 'right';
  /** Rendered after the label/sort-arrow group, pinned to the cell's trailing (right) edge via justify-between — e.g. a header filter dropdown. Keeps label → sort → filter in that order for every column, regardless of `align`. */
  filter?: ReactNode;
  onMouseDownResize: (e: React.MouseEvent) => void;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

/** A <th> with a drag handle on its right edge to resize the column, shared by every data table in the app. */
export default function ResizableTh({ width, left, align, filter, onMouseDownResize, onClick, children, className = '' }: ResizableThProps) {
  return (
    <th
      style={{ width, ...(left !== undefined ? { left } : {}) }}
      onClick={onClick}
      className={`relative select-none overflow-hidden px-3 py-2 ${onClick ? 'cursor-pointer hover:text-gray-700' : ''} ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="inline-flex min-w-0 items-center gap-1">{children}</span>
        {filter}
      </div>
      <div
        onMouseDown={(e) => {
          e.stopPropagation();
          onMouseDownResize(e);
        }}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-blue-300 active:bg-blue-400"
      />
    </th>
  );
}
