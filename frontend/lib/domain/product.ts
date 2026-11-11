import type { Grams } from "./types";
import { formatKg } from "./weights";

/** « PONDU 500 g × 30 pkts », « PONDU 1 kg × 15 pkts » */
export function designation(name: string, packageWeightG: Grams, packagesPerCarton: number, unitLabel: string): string {
  const w = packageWeightG >= 1000 ? `${formatKg(packageWeightG)} kg` : `${packageWeightG} g`;
  return `${name.trim()} ${w} × ${packagesPerCarton} ${unitLabel}`;
}
