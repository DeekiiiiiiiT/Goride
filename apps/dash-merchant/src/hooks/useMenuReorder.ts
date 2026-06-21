import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { deliveryFetch } from '../lib/partner-api';
import { MenuCategory, MenuItem } from '../types/menu';
import { MerchantMenuData } from './useMerchantMenu';

interface ReorderPayload {
  categories?: { id: string; sortOrder: number }[];
  items?: { id: string; sortOrder: number; categoryId?: string }[];
}

export function useMenuReorder(merchantId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['merchant-menu', merchantId];

  const mutation = useMutation({
    mutationFn: (payload: ReorderPayload) =>
      deliveryFetch('/merchant/menu/reorder', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<MerchantMenuData>(queryKey);

      if (previous) {
        const next = { ...previous };

        if (payload.categories?.length) {
          const orderMap = new Map(payload.categories.map((c) => [c.id, c.sortOrder]));
          next.categories = [...previous.categories]
            .map((cat) => ({
              ...cat,
              sort_order: orderMap.get(cat.id) ?? cat.sort_order,
            }))
            .sort((a, b) => a.sort_order - b.sort_order);
        }

        if (payload.items?.length) {
          const orderMap = new Map(
            payload.items.map((item) => [item.id, { sortOrder: item.sortOrder, categoryId: item.categoryId }]),
          );
          next.items = [...previous.items]
            .map((item) => {
              const update = orderMap.get(item.id);
              if (!update) return item;
              return {
                ...item,
                sort_order: update.sortOrder,
                category_id: update.categoryId ?? item.category_id,
              };
            })
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        }

        queryClient.setQueryData(queryKey, next);
      }

      return { previous };
    },
    onError: (_err, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error('Failed to save menu order');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const reorderCategories = (ordered: MenuCategory[]) => {
    mutation.mutate({
      categories: ordered.map((cat, index) => ({
        id: cat.id,
        sortOrder: (index + 1) * 10,
      })),
    });
  };

  const reorderItems = (categoryId: string, ordered: MenuItem[]) => {
    mutation.mutate({
      items: ordered.map((item, index) => ({
        id: item.id,
        sortOrder: (index + 1) * 10,
        categoryId,
      })),
    });
  };

  return {
    reorderCategories,
    reorderItems,
    isPending: mutation.isPending,
  };
}
