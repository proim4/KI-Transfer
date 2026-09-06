interface ClearFilterButtonProps {
  active: boolean;
  onClear: () => void;
}

/** Resets every header filter dropdown (and the search box, where the caller wires it in) on a table in one click — greyed out when nothing is currently filtered. */
export default function ClearFilterButton({ active, onClear }: ClearFilterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClear}
      disabled={!active}
      className={`rounded-md border px-3 py-2 text-sm ${
        active ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50' : 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300'
      }`}
    >
      Clear Filter
    </button>
  );
}
