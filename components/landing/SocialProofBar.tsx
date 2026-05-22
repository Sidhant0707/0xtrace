export function SocialProofBar() {
  return (
    <div className="h-12 border-y border-[#1f1f1f] flex items-center justify-center">
      <div className="flex items-center gap-6 font-mono text-[12px] text-[#a1a1aa]">
        <span className="flex items-center gap-1.5">
          <span className="text-[#10b981]">★</span> Open source
        </span>
        <span className="text-[#3f3f46]">·</span>
        <span>MIT licensed</span>
        <span className="text-[#3f3f46]">·</span>
        <span>Self-hostable</span>
        <span className="text-[#3f3f46]">·</span>
        <span>TypeScript</span>
      </div>
    </div>
  );
}
