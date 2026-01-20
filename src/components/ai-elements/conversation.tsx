"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useState } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn("relative overflow-hidden", className)}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn("flex flex-col gap-8 p-4", className)}
    {...props}
  />
);

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { scrollRef, contentRef, scrollToBottom } = useStickToBottomContext();
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    const contentEl = contentRef.current;
    if (!scrollEl || !contentEl) return;

    const updateIsAtBottom = () => {
      const remaining =
        scrollEl.scrollHeight - scrollEl.clientHeight - scrollEl.scrollTop;
      setIsScrolledToBottom(remaining <= 4);
    };

    updateIsAtBottom();
    scrollEl.addEventListener("scroll", updateIsAtBottom, { passive: true });
    const resizeObserver = new ResizeObserver(updateIsAtBottom);
    resizeObserver.observe(contentEl);

    return () => {
      scrollEl.removeEventListener("scroll", updateIsAtBottom);
      resizeObserver.disconnect();
    };
  }, [scrollRef, contentRef]);

  if (isScrolledToBottom) return null;

  return (
    <div className="pointer-events-none absolute bottom-4 left-0 right-0 flex justify-center">
      <Button
        className={cn(
          "z-10 rounded-full shadow-md pointer-events-auto",
          "bg-background hover:bg-muted border border-border",
          className,
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    </div>
  );
};
