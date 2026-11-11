import { AppShell } from "@/components/layout/AppShell";
import { ProductsScreen } from "@/features/products/ProductsScreen";

export default function Page() {
  return (
    <AppShell title="Catalogue produits">
      <ProductsScreen />
    </AppShell>
  );
}
