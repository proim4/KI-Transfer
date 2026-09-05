import Dropdown from './Dropdown';

interface ColumnVisibilityMenuProps {
  columns: { key: string; label: string }[];
  hiddenKeys: Set<string>;
  onToggle: (key: string) => void;
}

/** "คอลัม" button shown above a table — lets the user show/hide individual columns; choice is remembered per table via useColumnVisibility. */
export default function ColumnVisibilityMenu({ columns, hiddenKeys, onToggle }: ColumnVisibilityMenuProps) {
  return (
    <Dropdown
      closeOnContentClick={false}
      summaryClassName="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
      panelClassName="absolute right-0 z-30 mt-1 max-h-80 w-56 overflow-auto rounded-md border border-gray-200 bg-white p-1 shadow-lg"
      label={
        <>
          คอลัม <span className="text-xs">▾</span>
        </>
      }
    >
      {columns.map((c) => (
        <label
          key={c.key}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <input type="checkbox" checked={!hiddenKeys.has(c.key)} onChange={() => onToggle(c.key)} />
          {c.label}
        </label>
      ))}
    </Dropdown>
  );
}
