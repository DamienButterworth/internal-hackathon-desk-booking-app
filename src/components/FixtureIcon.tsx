"use client";

import {
  DoorOpen,
  LogIn,
  Toilet,
  LogOut,
  FireExtinguisher,
  CookingPot,
  Coffee,
  Printer,
  TreePine,
  Sofa,
  Columns,
  Square,
  type LucideProps,
} from "lucide-react";

// Custom glyphs for fixtures lucide doesn't cover.
function StairsGlyph(props: LucideProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 20h4v-4h4v-4h4V8h4V4" />
      <path d="M3 20v-4h4v-4h4V8h4V4h4" opacity={0} />
    </svg>
  );
}

function ElevatorGlyph(props: LucideProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M12 3v18" />
      <path d="m8 11 1.5-2L11 11" />
      <path d="m13 13 1.5 2L16 13" />
    </svg>
  );
}

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  door: DoorOpen,
  entrance: LogIn,
  toilet: Toilet,
  fireExit: LogOut,
  extinguisher: FireExtinguisher,
  stairs: StairsGlyph,
  elevator: ElevatorGlyph,
  kitchen: CookingPot,
  coffee: Coffee,
  printer: Printer,
  plant: TreePine,
  sofa: Sofa,
  column: Columns,
};

export function FixtureIcon({
  name,
  ...props
}: { name: string } & LucideProps) {
  const Icon = ICONS[name] ?? Square;
  return <Icon {...props} />;
}
