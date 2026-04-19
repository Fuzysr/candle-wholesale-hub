import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import Catalog from "./pages/Catalog";
import ProductPage from "./pages/ProductPage";
import QuickOrder from "./pages/QuickOrder";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OrderSuccess from "./pages/OrderSuccess";
import WholesaleTerms from "./pages/WholesaleTerms";
import Contacts from "./pages/Contacts";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Account from "./pages/Account";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
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
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="wc-theme"
    >
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/*
              Account is a single component that branches on the current
              pathname so the sidebar layout + data queries stay shared.
              Adding more /account/* routes here is enough for the sidebar
              nav to pick them up (see `useLocation()` in Account.tsx).
            */}
            <Route path="/account" element={<Account />} />
            <Route path="/account/orders" element={<Account />} />
            <Route path="/account/profile" element={<Account />} />
            <Route path="/account/settings" element={<Account />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
