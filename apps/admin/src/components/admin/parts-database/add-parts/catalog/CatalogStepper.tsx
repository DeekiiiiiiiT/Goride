import { DStepper } from "./dominionKit";

const STEPS = ["The page", "Cars", "Parts", "Review"];
const EXTEND_STEPS = ["Look up part", "Catalogue link", "Which cars", "Review"];

export function CatalogStepper({
  step,
  singlePart,
  extendMode,
  onJump,
}: {
  step: 1 | 2 | 3 | 4;
  singlePart?: boolean;
  extendMode?: boolean;
  onJump?: (s: 1 | 2 | 3 | 4) => void;
}) {
  const base = extendMode ? EXTEND_STEPS : STEPS;
  const steps = singlePart ? base.map((s, i) => (i === 2 ? "The part" : s)) : base;
  return <DStepper steps={steps} current={step} onJump={onJump ? (n) => onJump(n as 1 | 2 | 3 | 4) : undefined} />;
}
