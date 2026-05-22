"use client";
import { FadeIn } from "./FadeIn";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Install",
      code: "npm install @prompt-tracer/sdk",
      lang: "bash",
      desc: "One package. Works with OpenAI, Anthropic, and any OpenAI-compatible API. Zero configuration required.",
    },
    {
      number: "02",
      title: "Wrap your client",
      code: "const ai = wrapOpenAI(openai, tracer);",
      lang: "typescript",
      desc: "A JavaScript Proxy intercepts every call. Tokens, cost, latency — captured automatically on the microtask queue.",
    },
    {
      number: "03",
      title: "Observe",
      code: null,
      lang: null,
      preview: true,
      desc: "Every session, every step, full context diff. Cost anomalies flagged the moment growth exceeds your baseline.",
    },
  ];

  return (
    // REMOVED the inline style background to let the global grid show
    <section className="py-[120px] px-6 border-y border-white/[0.04]">
      <div className="max-w-[1120px] mx-auto">
        <FadeIn direction="up">
          <div className="text-center mb-16">
            <p className="m-0 font-mono text-[12px] text-[#60a5fa] uppercase tracking-[3px]">
              How It Works
            </p>
            <h2 className="m-0 mt-4 text-[clamp(28px,3.5vw,44px)] font-semibold text-white leading-[1.1] tracking-[-0.03em]">
              Three lines of code.
              <br />
              <span className="text-[#71717a]">Full observability.</span>
            </h2>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/[0.04] rounded-xl overflow-hidden shadow-2xl">
          {steps.map((step, i) => (
            <FadeIn key={step.number} delay={i * 0.1} direction="up">
              {/* Added transparency and blur to the card background */}
              <div className="bg-[#0a0a0a]/60 backdrop-blur-md p-8 h-full">
                <div className="font-mono text-[12px] text-[#60a5fa] mb-3">
                  {step.number}
                </div>
                <h3 className="m-0 mb-4 text-[18px] font-semibold text-white">
                  {step.title}
                </h3>

                {step.code && (
                  <div className="mb-5 rounded-lg border border-white/[0.06] bg-[#0d0d0d] px-4 py-3">
                    <div className="font-mono text-[11px] text-[#71717a] mb-1">
                      {step.lang}
                    </div>
                    <code className="font-mono text-[12px] text-[#e4e4e7]">
                      {step.code}
                    </code>
                  </div>
                )}

                {step.preview && (
                  <div className="mb-5 rounded-lg border border-white/[0.06] bg-[#0d0d0d] p-4 space-y-2.5">
                    {[
                      { id: "a3f1", ok: true, cost: "$0.005" },
                      { id: "b2c4", ok: true, cost: "$0.012" },
                      { id: "9e4d", ok: false, cost: "$2.10" },
                    ].map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          {row.ok ? (
                            <CheckCircle2
                              size={13}
                              className="text-[#10b981]"
                            />
                          ) : (
                            <AlertTriangle
                              size={13}
                              className="text-[#f59e0b]"
                            />
                          )}
                          <span className="font-mono text-[12px] text-[#a1a1aa]">
                            sess-{row.id}
                          </span>
                          {!row.ok && (
                            <span className="font-mono text-[9px] text-[#f59e0b] bg-[#2d1a00] border border-[#451a03] px-1.5 py-0.5 rounded">
                              anomaly
                            </span>
                          )}
                        </div>
                        <span
                          className={`font-mono text-[12px] ${row.ok ? "text-[#71717a]" : "text-[#f59e0b]"}`}
                        >
                          {row.cost}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="m-0 text-[14px] text-[#a1a1aa] leading-[1.7]">
                  {step.desc}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
