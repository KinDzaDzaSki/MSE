import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 min-h-[44px] min-w-[44px]",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 shadow border-2 border-transparent focus:border-primary-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow border-2 border-transparent focus:border-destructive-foreground",
        outline:
          "border-2 border-input bg-background hover:bg-accent hover:text-accent-foreground focus:border-primary shadow-sm",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow border-2 border-transparent focus:border-secondary-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground border-2 border-transparent focus:border-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline border-2 border-transparent focus:border-primary rounded-sm p-2",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-12 rounded-md px-8",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  "aria-describedby"?: string
  "aria-label"?: string
  "aria-pressed"?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    
    // Enhanced accessibility for disabled state
    const accessibilityProps = disabled ? {
      'aria-disabled': true,
      tabIndex: -1,
    } : {}

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled}
        {...accessibilityProps}
        {...props}
      >
        {children}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }