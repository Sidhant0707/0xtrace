// components/landing/BackgroundGrid.tsx

export function BackgroundGrid() {
  return (
    <div className="fixed inset-0 z-[-1] pointer-events-none bg-[#080808]">
      {/* Subtle blue radial glow centered at the top */}
      <div className="absolute top-0 left-0 right-0 h-[800px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#3b82f6]/15 via-[#0a0a0a]/0 to-transparent" />

      {/* The uniform grid pattern */}
      <div className="absolute inset-0 opacity-[0.02] bg-[linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] bg-[length:48px_48px]" />
    </div>
  );
}
