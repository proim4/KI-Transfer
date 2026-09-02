/** Stacks a code and its name in one table cell — halves the column count on wide tables (origin/dest/SKU) versus separate code/name columns. */
export default function CodeName({ code, name }: { code: string; name: string }) {
  return (
    <div>
      <div>{name}</div>
      <div className="text-xs text-gray-400">{code}</div>
    </div>
  );
}
