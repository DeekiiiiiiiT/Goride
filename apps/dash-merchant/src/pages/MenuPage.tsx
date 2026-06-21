import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { Merchant } from '../hooks/useMerchant';
import { toast } from 'sonner';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import MenuPageHeader from '../components/menu/MenuPageHeader';
import MenuOverviewView from '../components/menu/MenuOverviewView';
import MenuManagementView from '../components/menu/MenuManagementView';
import CategoryItemsView from '../components/menu/CategoryItemsView';
import EditItemView from '../components/menu/EditItemView';
import AddCategorySheet from '../components/menu/AddCategorySheet';
import { MenuCategory, MenuItem, MenuView, createEmptyMenuItem } from '../types/menu';
import QueryErrorState from '../components/QueryErrorState';
import PartnerSkeleton from '../components/PartnerSkeleton';
import PartnerDesktopShell from '../components/layout/PartnerDesktopShell';
import MenuDesktopDashboard from '../components/menu/MenuDesktopDashboard';
import { useAcceptingOrdersToggle } from '../hooks/useAcceptingOrdersToggle';
import { useMerchantMenu } from '../hooks/useMerchantMenu';
import { useMenuReorder } from '../hooks/useMenuReorder';
import { getAuthHeaders } from '../lib/partner-api';
import { readFlag } from '../lib/partner-feature-flags';
import { PartnerTab } from '../lib/partner-utils';

interface MenuPageProps {
  merchant: Merchant;
  onNavigate?: (tab: PartnerTab) => void;
}

export default function MenuPage({ merchant, onNavigate }: MenuPageProps) {
  const [view, setView] = useState<MenuView>('overview');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [showCategorySheet, setShowCategorySheet] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const queryClient = useQueryClient();
  const { isAcceptingOrders, toggleAcceptingOrders, isPending: togglePending } =
    useAcceptingOrdersToggle(merchant);
  const dragEnabled = readFlag(merchant.id, 'menuDragReorder');
  const { reorderCategories, reorderItems } = useMenuReorder(merchant.id);

  const { data, isLoading, isError, refetch } = useMerchantMenu(merchant.id);

  const categories: MenuCategory[] = data?.categories || [];
  const items: MenuItem[] = data?.items || [];

  const getAuthHeadersForMutation = getAuthHeaders;

  const itemsByCategory = useMemo(() => {
    const grouped: Record<string, MenuItem[]> = {};
    categories.forEach((category) => {
      grouped[category.id] = [];
    });
    items.forEach((item) => {
      if (item.category_id && grouped[item.category_id]) {
        grouped[item.category_id].push(item);
      }
    });
    return grouped;
  }, [categories, items]);

  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);

  const saveCategoryMutation = useMutation({
    mutationFn: async ({ id, name }: { id?: string; name: string }) => {
      const headers = await getAuthHeadersForMutation();

      if (id) {
        const res = await fetch(
          `${API_ENDPOINTS.delivery}/merchants/${merchant.id}/categories/${id}`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify({ name }),
          }
        );
        if (!res.ok) throw new Error('Failed to update category');
        return res.json();
      }

      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/categories`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, sortOrder: categories.length }),
      });
      if (!res.ok) throw new Error('Failed to add category');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-menu'] });
      toast.success(editingCategory ? 'Category updated' : 'Category added');
      setShowCategorySheet(false);
      setEditingCategory(null);
    },
    onError: () => toast.error('Failed to save category'),
  });

  const saveItemMutation = useMutation({
    mutationFn: async (item: MenuItem) => {
      const headers = await getAuthHeadersForMutation();

      const payload = {
        name: item.name,
        description: item.description,
        price: item.price,
        categoryId: item.category_id || null,
        imageUrl: item.image_url,
        isAvailable: item.is_available,
        isFeatured: item.is_featured,
        prepTimeMins: item.prep_time_mins,
        calories: item.calories,
        options: item.options,
      };

      if (item.id) {
        const res = await fetch(
          `${API_ENDPOINTS.delivery}/merchants/${merchant.id}/items/${item.id}`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify({
              name: item.name,
              description: item.description,
              price: item.price,
              category_id: item.category_id || null,
              image_url: item.image_url,
              is_available: item.is_available,
              is_featured: item.is_featured,
              prep_time_mins: item.prep_time_mins,
              calories: item.calories,
              options: item.options,
            }),
          }
        );
        if (!res.ok) throw new Error('Failed to update item');
        return res.json();
      }

      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/items`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to add item');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-menu'] });
      toast.success(editingItem?.id ? 'Item updated' : 'Item added');
      setView(selectedCategoryId ? 'category' : 'overview');
      setEditingItem(null);
    },
    onError: () => toast.error('Failed to save item'),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const headers = await getAuthHeadersForMutation();
      const res = await fetch(
        `${API_ENDPOINTS.delivery}/merchants/${merchant.id}/items/${itemId}`,
        {
          method: 'DELETE',
          headers,
        }
      );
      if (!res.ok) throw new Error('Failed to delete item');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-menu'] });
      toast.success('Item deleted');
      setView(selectedCategoryId ? 'category' : 'overview');
      setEditingItem(null);
    },
    onError: () => toast.error('Failed to delete item'),
  });

  const toggleAvailabilityMutation = useMutation({
    mutationFn: async ({ itemId, isAvailable }: { itemId: string; isAvailable: boolean }) => {
      const headers = await getAuthHeadersForMutation();
      const res = await fetch(
        `${API_ENDPOINTS.delivery}/merchants/${merchant.id}/items/${itemId}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ is_available: isAvailable }),
        }
      );
      if (!res.ok) throw new Error('Failed to update availability');
      return res.json();
    },
    onSuccess: (_, { isAvailable }) => {
      queryClient.invalidateQueries({ queryKey: ['merchant-menu'] });
      toast.success(isAvailable ? 'Item is now available' : 'Item marked as sold out');
    },
    onError: () => toast.error('Failed to update availability'),
  });

  const markAllAvailableMutation = useMutation({
    mutationFn: async () => {
      const headers = await getAuthHeadersForMutation();
      const soldOutItems = items.filter((item) => !item.is_available);
      await Promise.all(
        soldOutItems.map((item) =>
          fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/items/${item.id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ is_available: true }),
          }).then((res) => {
            if (!res.ok) throw new Error('Failed to update availability');
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-menu'] });
      toast.success('All items marked as available');
    },
    onError: () => toast.error('Failed to mark all items available'),
  });

  const openAddCategory = () => {
    setEditingCategory(null);
    setShowCategorySheet(true);
  };

  const openCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setView('category');
  };

  const openEditItem = (item?: MenuItem) => {
    setEditingItem(item || null);
    setView('edit-item');
  };

  const handleToggleManagement = () => {
    setView((current) => (current === 'management' ? 'overview' : 'management'));
  };

  if (view === 'edit-item') {
    return (
      <EditItemView
        item={editingItem}
        categories={categories}
        defaultCategoryId={selectedCategoryId || undefined}
        onBack={() => {
          setView(selectedCategoryId ? 'category' : 'overview');
          setEditingItem(null);
        }}
        onSave={(item) => saveItemMutation.mutate(item)}
        onDelete={(itemId) => deleteItemMutation.mutate(itemId)}
        isPending={saveItemMutation.isPending || deleteItemMutation.isPending}
      />
    );
  }

  if (view === 'category' && selectedCategory) {
    return (
      <div className="md:hidden">
        <CategoryItemsView
          categoryName={selectedCategory.name}
          items={itemsByCategory[selectedCategory.id] || []}
          onBack={() => {
            setView('overview');
            setSelectedCategoryId(null);
          }}
          onAddItem={() => openEditItem()}
          onEditItem={openEditItem}
          onToggleAvailability={(itemId, isAvailable) =>
            toggleAvailabilityMutation.mutate({ itemId, isAvailable })
          }
          dragEnabled={dragEnabled}
          onReorderItems={(ordered) => reorderItems(selectedCategory.id, ordered)}
        />
      </div>
    );
  }

  const categorySheet = (
    <AddCategorySheet
      open={showCategorySheet}
      initialName={editingCategory?.name || ''}
      title={editingCategory ? 'Edit Category' : 'Add Category'}
      onClose={() => {
        setShowCategorySheet(false);
        setEditingCategory(null);
      }}
      onSave={(name) => saveCategoryMutation.mutate({ id: editingCategory?.id, name })}
      isSubmitting={saveCategoryMutation.isPending}
    />
  );

  return (
    <>
      <div className="hidden h-dvh md:flex">
        <PartnerDesktopShell
          merchant={merchant}
          activeNavKey="menu"
          onNavigate={(tab) => onNavigate?.(tab)}
          onHistory={() => onNavigate?.('orders')}
          onSupport={() => onNavigate?.('account')}
          onGoOffline={() => toggleAcceptingOrders(false)}
          isAcceptingOrders={isAcceptingOrders}
          onToggleAcceptingOrders={toggleAcceptingOrders}
          togglePending={togglePending}
          toggleLabel="Accepting Orders"
          headerVariant="brand"
          showRestaurantInfo
          onSettings={() => onNavigate?.('account')}
        >
          {isLoading ? (
            <main className="flex flex-1 flex-col gap-inset-sm bg-background p-gutter">
              <PartnerSkeleton variant="list" count={5} />
            </main>
          ) : isError ? (
            <main className="flex flex-1 items-center justify-center bg-background p-gutter">
              <QueryErrorState message="Could not load menu" onRetry={() => refetch()} />
            </main>
          ) : categories.length === 0 && items.length === 0 ? (
            <main className="flex flex-1 flex-col items-center justify-center bg-background p-inset-xl text-center">
              <MaterialIcon name="restaurant_menu" className="mb-4 text-5xl text-on-surface-variant" />
              <h2 className="mb-2 text-headline-md text-on-background">Start building your menu</h2>
              <p className="mb-6 text-body-sm text-on-surface-variant">
                Add categories to organize your items, then add menu items.
              </p>
              <button
                type="button"
                onClick={openAddCategory}
                className="inline-flex h-12 items-center justify-center rounded-lg bg-primary-container px-inset-lg text-label-md text-white"
              >
                Add Category
              </button>
            </main>
          ) : (
            <MenuDesktopDashboard
              categories={categories}
              items={items}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={setSelectedCategoryId}
              onAddCategory={openAddCategory}
              onAddItem={() => openEditItem()}
              onEditItem={openEditItem}
              onToggleAvailability={(itemId, isAvailable) =>
                toggleAvailabilityMutation.mutate({ itemId, isAvailable })
              }
              dragEnabled={dragEnabled}
              onReorderCategories={reorderCategories}
              onReorderItems={reorderItems}
            />
          )}
        </PartnerDesktopShell>
        {categorySheet}
      </div>

      <div className="min-h-screen bg-background pb-24 md:hidden">
      <MenuPageHeader merchant={merchant} />

      {isLoading ? (
        <div className="mx-auto max-w-3xl px-margin-mobile py-inset-md md:px-margin-tablet">
          <PartnerSkeleton variant="list" count={4} />
        </div>
      ) : isError ? (
        <div className="mx-auto max-w-3xl px-margin-mobile py-inset-md md:px-margin-tablet">
          <QueryErrorState message="Could not load menu" onRetry={() => refetch()} />
        </div>
      ) : categories.length === 0 && items.length === 0 ? (
        <div className="mx-auto max-w-3xl px-margin-mobile py-inset-xl text-center md:px-margin-tablet">
          <MaterialIcon name="restaurant_menu" className="mx-auto mb-4 text-5xl text-on-surface-variant" />
          <h2 className="mb-2 text-headline-md text-on-background">Start building your menu</h2>
          <p className="mb-6 text-body-sm text-on-surface-variant">
            Add categories to organize your items, then add menu items.
          </p>
          <button
            type="button"
            onClick={openAddCategory}
            className="inline-flex h-12 items-center justify-center rounded-lg bg-primary-container px-inset-lg text-label-md text-white"
          >
            Add Category
          </button>
        </div>
      ) : view === 'management' ? (
        <MenuManagementView
          categories={categories}
          items={items}
          onBack={() => setView('overview')}
          onMarkAllAvailable={() => markAllAvailableMutation.mutate()}
          onToggleAvailability={(itemId, isAvailable) =>
            toggleAvailabilityMutation.mutate({ itemId, isAvailable })
          }
          isMarkingAll={markAllAvailableMutation.isPending}
        />
      ) : (
        <MenuOverviewView
          categories={categories}
          itemsByCategory={itemsByCategory}
          onAddCategory={openAddCategory}
          onOpenCategory={openCategory}
          onToggleManagement={handleToggleManagement}
          managementMode={view === 'management'}
          dragEnabled={dragEnabled}
          onReorderCategories={reorderCategories}
        />
      )}

      {categorySheet}
    </div>
    </>
  );
}
