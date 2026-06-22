import { useCallback } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";

import {
  catalogApi,
  companyApi,
  ordersApi,
  stockApi,
  usersApi,
  type AttributeKind,
  type AttributeOut,
  type CategoryOut,
  type DiscountTierOut,
  type OrderListOut,
  type ProductOut,
  type UserOut,
} from "@/lib/api";
import { contactApi, type ContactMessageOut } from "@/lib/api/contact";

const EMPTY_ORDERS: OrderListOut[] = [];
const EMPTY_PRODUCTS: ProductOut[] = [];
const EMPTY_CATEGORIES: CategoryOut[] = [];
const EMPTY_LOOKUPS: AttributeOut[] = [];
const EMPTY_DISCOUNTS: DiscountTierOut[] = [];
const EMPTY_USERS: UserOut[] = [];
const EMPTY_MESSAGES: ContactMessageOut[] = [];

export const useAdminData = (enabled: boolean) => {
  const queryClient = useQueryClient();
  const [
    ordersQuery,
    productsQuery,
    categoriesQuery,
    materialsQuery,
    scentsQuery,
    shapesQuery,
    companyQuery,
    discountsQuery,
    usersQuery,
    messagesQuery,
  ] = useQueries({
    queries: [
      { queryKey: ["admin", "orders"], queryFn: () => ordersApi.adminList(), enabled },
      {
        queryKey: ["admin", "products"],
        queryFn: () => catalogApi.adminListProducts(),
        enabled,
      },
      { queryKey: ["categories"], queryFn: () => catalogApi.listCategories(), enabled },
      {
        queryKey: ["attributes", "materials"],
        queryFn: () => catalogApi.listAttributes("materials"),
        enabled,
      },
      {
        queryKey: ["attributes", "scents"],
        queryFn: () => catalogApi.listAttributes("scents"),
        enabled,
      },
      {
        queryKey: ["attributes", "shapes"],
        queryFn: () => catalogApi.listAttributes("shapes"),
        enabled,
      },
      { queryKey: ["company-settings"], queryFn: () => companyApi.get(), enabled },
      { queryKey: ["discount-tiers"], queryFn: () => stockApi.listDiscountTiers(), enabled },
      { queryKey: ["admin", "users"], queryFn: () => usersApi.adminList(), enabled },
      {
        queryKey: ["admin", "contact-messages"],
        queryFn: () => contactApi.list(),
        enabled,
      },
    ],
  });

  const reloadProducts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  }, [queryClient]);
  const reloadCategories = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
    [queryClient],
  );
  const reloadAttributes = useCallback(
    (kind: AttributeKind) =>
      queryClient.invalidateQueries({ queryKey: ["attributes", kind] }),
    [queryClient],
  );
  const reloadOrders = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["admin", "orders"] }),
    [queryClient],
  );
  const reloadCompany = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["company-settings"] }),
    [queryClient],
  );
  const reloadDiscounts = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["discount-tiers"] }),
    [queryClient],
  );
  const reloadContactMessages = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["admin", "contact-messages"] }),
    [queryClient],
  );

  return {
    orders: ordersQuery.data ?? EMPTY_ORDERS,
    products: productsQuery.data ?? EMPTY_PRODUCTS,
    categories: categoriesQuery.data ?? EMPTY_CATEGORIES,
    materials: materialsQuery.data ?? EMPTY_LOOKUPS,
    scents: scentsQuery.data ?? EMPTY_LOOKUPS,
    shapes: shapesQuery.data ?? EMPTY_LOOKUPS,
    companyData: companyQuery.data,
    discountTiers: discountsQuery.data ?? EMPTY_DISCOUNTS,
    users: usersQuery.data ?? EMPTY_USERS,
    contactMessages: messagesQuery.data ?? EMPTY_MESSAGES,
    reloadProducts,
    reloadCategories,
    reloadAttributes,
    reloadOrders,
    reloadCompany,
    reloadDiscounts,
    reloadContactMessages,
  };
};
