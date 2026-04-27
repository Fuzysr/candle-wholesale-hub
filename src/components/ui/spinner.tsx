import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const Spinner = ({ className, ...props }: React.SVGAttributes<SVGSVGElement>) => (
  <Loader2 className={cn("h-5 w-5 animate-spin text-muted-foreground", className)} {...props} />
);

export { Spinner };
