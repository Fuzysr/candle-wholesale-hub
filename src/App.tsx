import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ScrollRestoration from "./components/ScrollRestoration";
import GlobalLoader from "./components/GlobalLoader";
import PageLoader from "./components/PageLoader";
import { removeLegacyKeys } from "./features/catalog-restore";

const Index = lazy(() => import("./pages/Index"));
const Catalog = lazy(() => import("./pages/Catalog"));
const ProductPage = lazy(() => import("./pages/ProductPage"));
const QuickOrder = lazy(() => import("./pages/QuickOrder"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));
const OrderSuccess = lazy(() => import("./pages/OrderSuccess"));
const WholesaleTerms = lazy(() => import("./pages/WholesaleTerms"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Gallery = lazy(() => import("./pages/Gallery"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Account = lazy(() => import("./pages/Account"));
const Admin = lazy(() => import("./pages/Admin"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => {
  // One-time bootstrap on app load:
  //   1. Disable native browser scroll restoration so it doesn't fight the
  //      manual logic in ScrollRestoration / useCatalogRestore (otherwise on
  //      browser back/forward the browser snaps to its own remembered
  //      position before our restore runs).
  //   2. Drop sessionStorage keys from the previous restoration scheme so
  //      stale values can't be misinterpreted by the new feature.
  useEffect(() => {
    if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
    removeLegacyKeys();
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    {/*
      `next-themes` writes the chosen theme class (`light` | `dark`) onto
      `<html>` and persists it to localStorage as `theme`. `attribute="class"`
      pairs with `darkMode: ["class"]` in tailwind.config.ts so all `.dark`
      variables in index.css activate automatically. `disableTransitionOnChange`
      prevents a flash of animated transitions during the switch.
    */}
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      storageKey="wc-theme"
    >
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollRestoration />
          <GlobalLoader />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/catalog/:categorySlug" element={<Catalog />} />
              <Route path="/product/:slug" element={<ProductPage />} />
              <Route path="/quick-order" element={<QuickOrder />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/order/success/:id" element={<OrderSuccess />} />
              <Route path="/wholesale-terms" element={<WholesaleTerms />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/gallery" element={<Gallery />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/account" element={<Account />} />
              <Route path="/account/orders" element={<Account />} />
              <Route path="/account/profile" element={<Account />} />
              <Route path="/account/settings" element={<Account />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
  );
};

export default App;
