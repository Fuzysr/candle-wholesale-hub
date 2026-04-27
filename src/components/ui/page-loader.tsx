import { Skeleton } from "@/components/ui/skeleton";

/** Full-page skeleton placeholder used while auth / data is loading. */
const PageLoader = () => (
  <div className="flex min-h-screen flex-col">
    {/* Fake topbar */}
    <div className="border-b border-border bg-surface px-6 py-3">
      <Skeleton className="h-8 w-32" />
    </div>
    <div className="container flex-1 py-10">
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64" />
      </div>
    </div>
  </div>
);

export { PageLoader };
