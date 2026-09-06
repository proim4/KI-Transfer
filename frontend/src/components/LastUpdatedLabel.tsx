import { formatDateTime } from '../lib/formatDateTime';

/** "อัปเดตล่าสุด {timestamp}" — shown wherever a page displays a Week's data, so it's always clear how fresh that data is. Renders nothing until a timestamp is known (no Week picked yet, or its uploads haven't loaded). */
export default function LastUpdatedLabel({ at }: { at: string | undefined }) {
  if (!at) return null;
  return <span className="text-sm text-gray-500">อัปเดตล่าสุด {formatDateTime(at)}</span>;
}
