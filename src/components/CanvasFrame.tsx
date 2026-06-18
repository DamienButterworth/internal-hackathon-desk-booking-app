"use client";

import { useEffect, useRef, useState } from "react";

// Measures available width and scales a fixed mapWidth×mapHeight canvas to fit.
// Children are rendered inside a layer that receives the computed `scale`, so
// both the static view and the react-rnd editor share the same coordinate space.
export function CanvasFrame({
  mapWidth,
  mapHeight,
  backgroundUrl,
  children,
}: {
  mapWidth: number;
  mapHeight: number;
  backgroundUrl?: string | null;
  children: (scale: number) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setScale(Math.min(1, w / mapWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapWidth]);

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden rounded-xl border border-line"
      style={{
        height: mapHeight * scale,
        background:
          "linear-gradient(#f6fafa,#eef3f4), repeating-linear-gradient(0deg,transparent,transparent 39px,#e6edee 39px,#e6edee 40px), repeating-linear-gradient(90deg,transparent,transparent 39px,#e6edee 39px,#e6edee 40px)",
      }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: mapWidth,
          height: mapHeight,
          transform: `scale(${scale})`,
        }}
      >
        {backgroundUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={backgroundUrl}
            alt=""
            className="pointer-events-none absolute left-0 top-0 h-full w-full object-contain"
            style={{ zIndex: 0 }}
          />
        )}
        {children(scale)}
      </div>
    </div>
  );
}
