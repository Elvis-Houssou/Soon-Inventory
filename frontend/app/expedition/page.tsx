import { Suspense } from "react";
import { Wizard } from "@/features/shipments/Wizard";

// useSearchParams impose une frontière Suspense pour que la page reste statique.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Wizard />
    </Suspense>
  );
}
