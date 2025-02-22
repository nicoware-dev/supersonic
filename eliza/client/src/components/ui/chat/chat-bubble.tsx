import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

const chatBubbleVariants = cva(
    "relative flex w-max max-w-[70%] flex-col gap-2 text-sm leading-relaxed tracking-normal transition-all duration-200",
    {
        variants: {
            variant: {
                sent: "ml-auto bg-gradient-to-br from-[#7000ff] via-[#6000c7] to-[#4a0099] shadow-lg text-white rounded-2xl rounded-tr-sm hover:shadow-purple-900/20",
                received: "bg-gradient-to-br from-[#27272A] via-[#1f1f1f] to-[#171717] shadow-md border border-white/[0.08] rounded-2xl rounded-tl-sm hover:shadow-white/[0.02]",
            },
        },
        defaultVariants: {
            variant: "received",
        },
    }
);

interface ChatBubbleProps
    extends React.HTMLAttributes<HTMLDivElement>,
        VariantProps<typeof chatBubbleVariants> {
    children: React.ReactNode;
}

export function ChatBubble({
    className,
    variant,
    children,
    ...props
}: ChatBubbleProps) {
    return (
        <div
            className={cn(
                chatBubbleVariants({ variant }),
                "hover:translate-y-[-1px] active:translate-y-[1px] transition-all duration-200 ease-out px-5 py-3",
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}

interface ChatBubbleMessageProps extends React.HTMLAttributes<HTMLDivElement> {
    isLoading?: boolean;
}

export function ChatBubbleMessage({
    className,
    children,
    isLoading,
    ...props
}: ChatBubbleMessageProps) {
    if (isLoading) {
        return (
            <div
                className={cn(
                    "flex items-center gap-2 text-muted-foreground animate-pulse font-medium tracking-tight",
                    className
                )}
                {...props}
            >
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
            </div>
        );
    }

    return (
        <div
            className={cn(
                "break-words [word-break:break-word] [hyphens:auto]",
                "animate-in fade-in-0 slide-in-from-bottom-1 duration-200",
                "leading-relaxed tracking-normal",
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}

export function ChatBubbleTimestamp({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "sent" | "received" }) {
    return (
        <div
            className={cn(
                "select-none text-[10px] font-light tracking-wide",
                props.variant === "sent" ? "text-white/70" : "text-muted-foreground",
                className
            )}
            {...props}
        />
    );
}
