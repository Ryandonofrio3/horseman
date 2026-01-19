"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { getToolIcon, getToolColor } from "@/lib/tools";
import type { ToolUIPart } from "ai";
import {
  CheckIcon,
  ChevronRightIcon,
  CircleIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";
import { CodeBlock } from "./code-block";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      "group not-prose rounded-lg border border-border/40 bg-card/50 overflow-hidden",
      className
    )}
    {...props}
  />
);

export type ToolHeaderProps = {
  title?: string;
  type: ToolUIPart["type"] | string;
  state: ToolUIPart["state"] | "awaiting-input";
  preview?: string;
  className?: string;
};

// Compact status indicator (icon only, no text)
const getStatusIndicator = (status: ToolUIPart["state"] | "awaiting-input") => {
  switch (status) {
    case "input-streaming":
      return (
        <span className="flex items-center text-muted-foreground">
          <CircleIcon className="h-2 w-2 fill-current" />
        </span>
      );
    case "input-available":
      return (
        <span className="flex items-center text-blue-500">
          <Loader2Icon className="h-3 w-3 animate-spin" />
        </span>
      );
    case "approval-requested":
    case "awaiting-input":
      return (
        <span className="flex items-center text-amber-500">
          <CircleIcon className="h-2 w-2 fill-current animate-pulse" />
        </span>
      );
    case "approval-responded":
    case "output-available":
      return (
        <span className="flex items-center text-green-500">
          <CheckIcon className="h-3.5 w-3.5" />
        </span>
      );
    case "output-error":
      return (
        <span className="flex items-center text-red-500">
          <XIcon className="h-3.5 w-3.5" />
        </span>
      );
    case "output-denied":
      return (
        <span className="flex items-center text-orange-500">
          <XIcon className="h-3.5 w-3.5" />
        </span>
      );
    default:
      return null;
  }
};

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  preview,
  ...props
}: ToolHeaderProps) => {
  const toolName = title ?? type.split("-").slice(1).join("-");
  const ToolIcon = getToolIcon(toolName);
  const toolColor = getToolColor(toolName);

  return (
    <CollapsibleTrigger
      className={cn(
        "group flex w-full items-center gap-2 px-3 py-2 text-sm",
        "hover:bg-muted/30 transition-colors cursor-pointer",
        className
      )}
      {...props}
    >
      <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-90" />
      <ToolIcon className={cn("h-3.5 w-3.5 shrink-0", toolColor)} />
      <span className="font-medium text-foreground">{toolName}</span>
      {preview && (
        <span className="truncate text-muted-foreground text-xs flex-1 min-w-0">
          {preview}
        </span>
      )}
      <span className="ml-auto shrink-0">{getStatusIndicator(state)}</span>
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "overflow-hidden border-t border-border/40",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolUIPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-2 overflow-hidden p-4", className)} {...props}>
    <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
      Parameters
    </h4>
    <div className="rounded-md bg-muted/50">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolUIPart["output"];
  errorText: ToolUIPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  let Output = <div>{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = (
      <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
    );
  } else if (typeof output === "string") {
    Output = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-2 p-4", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {errorText ? "Error" : "Result"}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs [&_table]:w-full",
          errorText
            ? "bg-destructive/10 text-destructive"
            : "bg-muted/50 text-foreground"
        )}
      >
        {errorText && <div>{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
