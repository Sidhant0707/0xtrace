// components/dashboard/TagBadge.tsx

interface TagBadgeProps {
  tagKey: string;
  tagValue: string;
}

export function TagBadge({ tagKey, tagValue }: TagBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono">
      <span className="text-zinc-400">{tagKey}:</span>
      <span className="text-zinc-200">{tagValue}</span>
    </span>
  );
}
