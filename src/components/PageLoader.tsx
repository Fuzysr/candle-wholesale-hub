/**
 * Full-screen branded loader shown while lazy-loaded page chunks
 * are being fetched. Mirrors the site logo and brand identity.
 */
const PageLoader = () => (
  <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background">
    {/* Logo + brand name */}
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-foreground text-lg font-bold text-background shadow-sm">
        CW
      </span>
      <span className="text-lg font-semibold tracking-tight text-foreground">
        CANDWAX
      </span>
    </div>

    {/* Progress bar */}
    <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-border">
      <div className="h-full w-full origin-left animate-[loader_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
    </div>

    {/* Status text */}
    <p className="mt-4 text-sm text-muted-foreground">Загружаем данные…</p>
  </div>
);

export default PageLoader;
