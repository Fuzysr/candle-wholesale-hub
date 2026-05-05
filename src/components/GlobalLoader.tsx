import { useIsFetching } from "@tanstack/react-query";

const GlobalLoader = () => {
  const isFetching = useIsFetching();

  if (!isFetching) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 h-0.5">
      <div className="h-full w-full animate-pulse bg-primary/60" />
      <div className="absolute left-0 top-0 h-full w-1/3 animate-[shimmer_1s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-primary to-transparent" />
    </div>
  );
};

export default GlobalLoader;
