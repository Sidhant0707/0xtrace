export function SocialProofBar() {
  const items = [
    { icon: "★", iconColor: "text-[#10b981]", label: "Open source" },
    { label: "MIT licensed" },
    { label: "Self-hostable" },
    { label: "TypeScript" },
  ];

  return (
    <div className="border-y border-[#1f1f1f] py-3 px-4">
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-[12px] text-[#a1a1aa]">
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5 whitespace-nowrap">
            {item.icon && <span className={item.iconColor}>{item.icon}</span>}
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
