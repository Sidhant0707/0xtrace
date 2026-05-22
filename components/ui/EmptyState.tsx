// components/ui/EmptyState.tsx
// Simple, on-brand, zero bundle cost

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="font-mono text-[48px] text-[#1f1f1f] mb-6">[ ]</div>
      <p className="text-white text-sm font-medium">{title}</p>
      <p className="mt-2 text-[#52525b] text-xs max-w-sm">{description}</p>
    </div>
  );
}
