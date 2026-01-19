"use client";

import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import {
  type CSSProperties,
  type ElementType,
  type JSX,
  memo,
  useMemo,
} from "react";

// Static animation values - defined outside component to prevent recreation
const SHIMMER_ANIMATE = { backgroundPosition: "0% center" } as const;
const SHIMMER_INITIAL = { backgroundPosition: "100% center" } as const;

export type TextShimmerProps = {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
};

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) => {
  const MotionComponent = motion.create(
    Component as keyof JSX.IntrinsicElements
  );

  const dynamicSpread = useMemo(
    () => (children?.length ?? 0) * spread,
    [children, spread]
  );

  const shimmerStyle = useMemo(
    () =>
      ({
        "--spread": `${dynamicSpread}px`,
        backgroundImage:
          "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
      }) as CSSProperties,
    [dynamicSpread]
  );

  const shimmerTransition = useMemo(
    () => ({
      repeat: Number.POSITIVE_INFINITY,
      duration,
      ease: "linear" as const,
    }),
    [duration]
  );

  return (
    <MotionComponent
      animate={SHIMMER_ANIMATE}
      className={cn(
        "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
        "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
        className
      )}
      initial={SHIMMER_INITIAL}
      style={shimmerStyle}
      transition={shimmerTransition}
    >
      {children}
    </MotionComponent>
  );
};

export const Shimmer = memo(ShimmerComponent);
