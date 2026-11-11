# Soon Inventory — Plan 1 : cœur local — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une application Next.js où l'on crée, reprend et retrouve une expédition (conteneurs, marchandises, totaux) entièrement enregistrée sur l'appareil, sans serveur.

**Architecture:** La logique métier est faite de fonctions pures (`lib/domain`), testées seules. Les données vivent dans IndexedDB via Dexie (`lib/db`) ; chaque écran est un composant client qui lit Dexie en direct et n'appelle aucun serveur. Chaque écriture ajoute une entrée d'outbox, que le Plan 4 enverra au serveur.

**Tech Stack:** Next.js 16.4.6 (App Router), React 19, TypeScript strict, Tailwind 4, Dexie + dexie-react-hooks, lucide-react, Vitest + fake-indexeddb.

**Spec:** `INVENTORY_APP_BRIEF_CLAUDE.md` (brief), `docs/schema-donnees.md` (schémas, §3 pour les types locaux), `maquettes/index.html` (maquette validée : mise en page, textes, tokens).

## Feuille de route

| Plan | Contenu | Livrable testable | Accès à fournir |
|---|---|---|---|
| **1. Cœur local** (ce document) | Calculs, Dexie, shell, parcours de création, accueil, historique, catalogue, paramètres | Créer et reprendre une expédition sans serveur | Aucun |
| 2. Documents | Aperçu fidèle, PDF, Excel (ExcelJS), versions de documents | Exporter la fiche du client à l'identique | Aucun |
| 3. PWA hors ligne | Manifest, service worker, installation, persistance du stockage | L'application s'ouvre et fonctionne sans réseau | Aucun |
| 4. Serveur et synchronisation | FastAPI, PostgreSQL (Neon), authentification, push/pull, conflits | Deux appareils voient les mêmes expéditions | `DATABASE_URL` Neon |
| 5. Finition et lancement | Motion, GSAP, vue 3D, tests Android/Windows, Sentry, déploiement | Mise en production | DSN Sentry, compte d'hébergement |

Les plans 2 à 5 seront écrits un par un, chacun après validation du précédent.

**Accès :** jamais de clé dans la conversation. Au Plan 4, un fichier `backend/.env.example` listera les variables ; l'utilisateur copie ce fichier en `backend/.env` (ignoré par git) et y colle lui-même les valeurs.

## Global Constraints

- Avant d'écrire du code Next.js, lire le guide concerné dans `frontend/node_modules/next/dist/docs/` : cette version a des changements cassants (`frontend/AGENTS.md`).
- Tous les poids sont des **grammes entiers**. Aucun flottant dans un calcul ; la conversion en kg n'a lieu qu'à l'affichage.
- Terme technique unique : `shipment`. « Inventaire » et « expédition » sont les mots de l'interface.
- Interface en français, phrases simples, aucune notion d'Excel.
- Tout écran applicatif est un composant client (`"use client"`) qui lit Dexie. Aucun `fetch` vers un serveur dans ce plan.
- Routes statiques uniquement : l'identifiant d'une expédition passe en paramètre de requête (`/expedition?id=…`), pas en segment dynamique, pour que le Plan 3 puisse tout pré-cacher.
- Couleurs, rayons et polices uniquement par variables CSS ; valeurs reprises du bloc `:root` de `maquettes/index.html`.
- Zones tactiles d'au moins 44 px. Aucune interaction qui exige le survol.
- Ne pas installer une librairie si un composant simple suffit. Zustand, TanStack Query, React Hook Form et shadcn/ui ne sont pas installés dans ce plan.
- Aucune donnée d'exemple insérée en base : les états vides guident vers la première action.
- Un produit n'apparaît qu'une fois par conteneur.

## Review Focus

1. **Quantité mal saisie** (`12,5`, `-3`, vide, `1e9`) : la quantité devient un entier entre 0 et 999 999, les totaux ne valent jamais `NaN`. → Task 1.
2. **Poids avec virgule ou unité** (`0,5` kg, `500` g, `0`, vide) : `0,5 kg` vaut 500 g ; zéro et vide sont refusés. → Task 1.
3. **Onglet fermé en pleine saisie** : à la réouverture, le brouillon est intact, car chaque modification est enregistrée. → Task 3 et Task 6.
4. **Produit modifié ou désactivé après usage** : les lignes déjà saisies gardent leur désignation et leur poids. → Task 2.
5. **Suppression d'un conteneur rempli** : confirmation demandée ; le dernier conteneur ne peut pas être supprimé. → Task 2 et Task 6.

---

### Task 1: Calculs de poids et outillage de test

**Files:**
- Create: `frontend/vitest.config.ts`, `frontend/lib/domain/types.ts`, `frontend/lib/domain/weights.ts`
- Modify: `frontend/package.json` (script `"test": "vitest run"`)
- Test: `frontend/lib/domain/weights.test.ts`

**Interfaces:**
- Produces: les types de `docs/schema-donnees.md` §3, recopiés tels quels dans `types.ts` (`Grams`, `SyncState`, `SyncFields`, `Shipment`, `Container`, `ContainerItem`, `Product`, `Destination`, `OutboxEntry`). `Destination extends SyncFields { id: string; name: string; countryCode?: string }`.
- Produces dans `weights.ts` :
  - `cartonWeightG(p: Pick<Product,'packageWeightG'|'packagesPerCarton'|'grossWeightPerCartonG'|'weightType'>): Grams`
  - `lineWeightG(it: ContainerItem): Grams`
  - `containerTotals(c: Container): { cartons: number; weightG: Grams }`
  - `shipmentTotals(s: Shipment): { cartons: number; weightG: Grams }`
  - `formatKg(g: Grams): string`, `formatInt(n: number): string` (`Intl.NumberFormat('fr-FR')`)
  - `parseWeightToGrams(input: string, unit: 'kg' | 'g'): Grams | null`
  - `parseQuantity(input: string): number`

- [ ] **Step 0: Dépôt git** — il n'y a pas de dépôt à la racine, et `frontend/` contient son propre `.git` (un seul commit, « Initial commit from Create Next App »). Avec l'accord de l'utilisateur : supprimer `frontend/.git`, puis `git init` à la racine avec un `.gitignore` qui exclut `node_modules`, `.next`, `.env`. Sans cet accord, committer dans `frontend/` et laisser `docs/` et `maquettes/` hors dépôt.

- [ ] **Step 1: Installer l'outillage**

Run: `cd frontend && npm i dexie dexie-react-hooks lucide-react && npm i -D vitest fake-indexeddb`
`vitest.config.ts` : environnement `node`, alias `@` vers la racine de `frontend`.

- [ ] **Step 2: Écrire les tests**

```ts
const item = (unitWeightG: number, quantityCartons: number): ContainerItem =>
  ({ id: crypto.randomUUID(), productId: 'p', productName: 'x', designation: 'x', quantityCartons, unitWeightG, weightType: 'net' });
const ref: Container = { id: 'c', containerNumber: '', sealNumber: '', items: [
  item(20000, 381), item(20000, 104), item(15000, 590), item(15000, 42), item(15000, 143), item(15000, 153)] };
const sp = (s: string) => s.replace(/\s/g, ' ');

test('fiche de référence du client', () => {
  expect(containerTotals(ref)).toEqual({ cartons: 1413, weightG: 23_620_000 });
  expect(sp(formatKg(23_620_000))).toBe('23 620');
});
test('poids du carton', () => {
  expect(cartonWeightG({ packageWeightG: 500, packagesPerCarton: 30, weightType: 'net' })).toBe(15000);
  expect(cartonWeightG({ packageWeightG: 1000, packagesPerCarton: 15, grossWeightPerCartonG: 15800, weightType: 'gross' })).toBe(15800);
});
test('kg non entiers', () => { expect(formatKg(630_500)).toBe('630,5'); });
test('saisie de poids', () => {
  expect(parseWeightToGrams('0,5', 'kg')).toBe(500);
  expect(parseWeightToGrams('500', 'g')).toBe(500);
  expect(parseWeightToGrams(' 1 ', 'kg')).toBe(1000);
  for (const bad of ['', 'abc', '0', '-2']) expect(parseWeightToGrams(bad, 'kg')).toBeNull();
});
test('saisie de quantité', () => {
  expect(parseQuantity('381')).toBe(381);
  expect(parseQuantity('12,5')).toBe(12);
  expect(parseQuantity('1e9')).toBe(1);
  expect(parseQuantity('-3')).toBe(0);
  expect(parseQuantity('')).toBe(0);
  expect(parseQuantity('99999999')).toBe(999_999);
});
test('expédition vide', () => {
  expect(shipmentTotals({ containers: [] } as unknown as Shipment)).toEqual({ cartons: 0, weightG: 0 });
});
```

- [ ] **Step 3: Vérifier l'échec** — Run: `npm test` → FAIL (module introuvable).
- [ ] **Step 4: Implémenter `types.ts` et `weights.ts`** — `parseQuantity` lit les chiffres de tête (`/^\d+/`) puis borne à 999 999. `parseWeightToGrams` remplace la virgule par un point et arrondit à l'entier.
- [ ] **Step 5: Vérifier** — Run: `npm test` → PASS, 6 tests.
- [ ] **Step 6: Commit** — `feat(domain): calculs de poids en grammes entiers`

---

### Task 2: Opérations sur une expédition

**Files:**
- Create: `frontend/lib/domain/shipment.ts`, `frontend/lib/domain/product.ts`
- Test: `frontend/lib/domain/shipment.test.ts`

**Interfaces:**
- Consumes: types et `cartonWeightG` de Task 1.
- Produces dans `product.ts` : `designation(name: string, packageWeightG: Grams, packagesPerCarton: number, unitLabel: string): string` → `PONDU 500 g × 30 pkts`, `PONDU 1 kg × 15 pkts`.
- Produces dans `shipment.ts` (toutes pures, renvoient un nouvel objet, ne modifient jamais leur argument) :
  - `newShipment(): Shipment` — statut `draft`, `version` 0, `syncState` `local`, un conteneur vide.
  - `addContainer(s): Shipment`, `removeContainer(s, containerId): Shipment` (sans effet s'il n'en reste qu'un)
  - `duplicateContainer(s, containerId): Shipment` — copie insérée juste après, nouveaux identifiants, numéros de conteneur et de plomb vides.
  - `updateContainer(s, containerId, patch: Partial<Omit<Container,'id'|'items'>>): Shipment`
  - `addItem(s, containerId, p: Product): { shipment: Shipment; index: number }` — si le produit est déjà dans le conteneur, renvoie l'expédition inchangée et l'index de la ligne existante.
  - `setQuantity(s, containerId, itemId, quantity: number): Shipment`, `removeItem(s, containerId, itemId): Shipment`
  - `effectiveDates(s, c: Container): { depotDate?: string; departureDate?: string }`
  - `duplicateShipment(src: Shipment): Shipment` — nouvel identifiant, `reference` vide, statut `draft`, `version` 0, dates effacées, numéros de conteneur et de plomb effacés, lignes et quantités conservées.
  - `type Issue = { code: 'destination' | 'dates' | 'dates_order' | 'container_number' | 'seal_number' | 'empty_container' | 'zero_quantity'; containerIndex?: number }`
  - `validateShipment(s): Issue[]`

- [ ] **Step 1: Écrire les tests**

```ts
const pondu: Product = { id: 'p1', name: 'PONDU', designation: 'PONDU 1 kg × 15 pkts', packageWeightG: 1000,
  packagesPerCarton: 15, weightType: 'net', unitLabel: 'pkts', isActive: true, version: 0, syncState: 'local', updatedAt: '' };

test('désignation', () => {
  expect(designation('PONDU', 500, 30, 'pkts')).toBe('PONDU 500 g × 30 pkts');
  expect(designation('PONDU', 1000, 15, 'pkts')).toBe('PONDU 1 kg × 15 pkts');
});
test('un produit, une ligne par conteneur', () => {
  const s0 = newShipment(); const cid = s0.containers[0].id;
  const a = addItem(s0, cid, pondu); const b = addItem(a.shipment, cid, pondu);
  expect(b.shipment.containers[0].items).toHaveLength(1);
  expect(b.index).toBe(0);
});
test('la ligne garde son poids si le produit change', () => {
  const s0 = newShipment(); const { shipment } = addItem(s0, s0.containers[0].id, pondu);
  pondu.packagesPerCarton = 99;
  expect(shipment.containers[0].items[0].unitWeightG).toBe(15000);
  expect(shipment.containers[0].items[0].designation).toBe('PONDU 1 kg × 15 pkts');
  pondu.packagesPerCarton = 15;
});
test('duplication de conteneur', () => {
  let s = newShipment(); const cid = s.containers[0].id;
  s = updateContainer(s, cid, { containerNumber: 'HLBU 995319 0', sealNumber: 'HLC 3784425' });
  s = addItem(s, cid, pondu).shipment;
  s = setQuantity(s, cid, s.containers[0].items[0].id, 590);
  const d = duplicateContainer(s, cid);
  expect(d.containers).toHaveLength(2);
  expect(d.containers[1].id).not.toBe(cid);
  expect(d.containers[1].containerNumber).toBe('');
  expect(d.containers[1].sealNumber).toBe('');
  expect(d.containers[1].items[0].id).not.toBe(d.containers[0].items[0].id);
});
test('le dernier conteneur ne se supprime pas', () => {
  const s = newShipment();
  expect(removeContainer(s, s.containers[0].id).containers).toHaveLength(1);
});
test('dates héritées ou personnalisées', () => {
  let s = { ...newShipment(), depotDate: '2026-03-26', departureDate: '2026-04-13' };
  expect(effectiveDates(s, s.containers[0])).toEqual({ depotDate: '2026-03-26', departureDate: '2026-04-13' });
  s = updateContainer(s, s.containers[0].id, { customDates: { depotDate: '2026-03-27', departureDate: '2026-04-14' } });
  expect(effectiveDates(s, s.containers[0]).depotDate).toBe('2026-03-27');
});
test('reprise : la source ne change pas', () => {
  let src = { ...newShipment(), reference: 'A', status: 'completed' as const, depotDate: '2026-03-26', version: 4 };
  src = updateContainer(src, src.containers[0].id, { containerNumber: 'HLBU 995319 0' });
  const before = structuredClone(src); const copy = duplicateShipment(src);
  expect(src).toEqual(before);
  expect(copy.id).not.toBe(src.id);
  expect(copy).toMatchObject({ reference: '', status: 'draft', version: 0, syncState: 'local' });
  expect(copy.depotDate).toBeUndefined();
  expect(copy.containers[0].containerNumber).toBe('');
});
test('alertes', () => {
  const codes = validateShipment(newShipment()).map(i => i.code);
  expect(codes).toEqual(['destination', 'dates', 'container_number', 'seal_number', 'empty_container']);
  const bad = { ...newShipment(), destinationId: 'd', depotDate: '2026-04-13', departureDate: '2026-03-26' };
  expect(validateShipment(bad).map(i => i.code)).toContain('dates_order');
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test` → FAIL.
- [ ] **Step 3: Implémenter `product.ts` et `shipment.ts`** — identifiants par `crypto.randomUUID()`. Chaque opération met à jour `containerNumbers` (numéros non vides).
- [ ] **Step 4: Vérifier** — Run: `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(domain): opérations sur une expédition`

---

### Task 3: Base locale Dexie et outbox

**Files:**
- Create: `frontend/lib/db/db.ts`, `frontend/lib/db/repo.ts`
- Test: `frontend/lib/db/repo.test.ts` (première ligne : `import 'fake-indexeddb/auto'`)

**Interfaces:**
- Consumes: types de Task 1.
- Produces dans `db.ts` : `export const db` (classe Dexie `SoonInventory`), `version(1).stores` recopié de `docs/schema-donnees.md` §3.
- Produces dans `repo.ts` :
  - `saveShipment(s: Shipment): Promise<void>`, `getShipment(id: string): Promise<Shipment | undefined>`
  - `listShipments(): Promise<Shipment[]>` — non supprimées, `updatedAt` décroissant.
  - `deleteShipment(id: string): Promise<void>` — pose `deletedAt`, ne retire pas la ligne.
  - `saveProduct(p: Product)`, `listProducts(opts?: { activeOnly?: boolean }): Promise<Product[]>`
  - `saveDestination(d: Destination)`, `deleteDestination(id: string)`, `listDestinations(): Promise<Destination[]>`
  - `getMeta<T>(key: string): Promise<T | undefined>`, `setMeta(key: string, value: unknown): Promise<void>`
- Toute écriture d'entité se fait dans une transaction Dexie avec l'outbox : elle fixe `updatedAt`, passe `syncState` à `pending`, et remplace l'entrée d'outbox de cette entité par une nouvelle (nouvel `id`).

- [ ] **Step 1: Écrire les tests**

```ts
beforeEach(async () => { await db.delete(); await db.open(); });

test('enregistrer puis relire', async () => {
  const s = newShipment(); await saveShipment(s);
  expect((await getShipment(s.id))?.containers).toHaveLength(1);
});
test('une seule entrée d’outbox par expédition, clé renouvelée', async () => {
  const s = newShipment(); await saveShipment(s);
  const k1 = (await db.outbox.toArray())[0].id;
  await saveShipment({ ...s, notes: 'x' });
  const all = await db.outbox.toArray();
  expect(all).toHaveLength(1);
  expect(all[0]).toMatchObject({ entityType: 'shipment', entityId: s.id, op: 'upsert', attempts: 0 });
  expect(all[0].id).not.toBe(k1);
});
test('état de synchronisation', async () => {
  const s = newShipment(); await saveShipment(s);
  expect((await getShipment(s.id))?.syncState).toBe('pending');
});
test('suppression synchronisable', async () => {
  const s = newShipment(); await saveShipment(s); await deleteShipment(s.id);
  expect(await listShipments()).toHaveLength(0);
  expect((await getShipment(s.id))?.deletedAt).toBeTruthy();
  expect((await db.outbox.toArray())[0].op).toBe('delete');
});
test('recherche par numéro de conteneur', async () => {
  let s = newShipment(); s = updateContainer(s, s.containers[0].id, { containerNumber: 'HLBU 995319 0' });
  await saveShipment(s);
  expect(await db.shipments.where('containerNumbers').equals('HLBU 995319 0').count()).toBe(1);
});
test('produits actifs seulement', async () => {
  await saveProduct({ ...pondu, id: 'a' }); await saveProduct({ ...pondu, id: 'b', designation: 'X', isActive: false });
  expect(await listProducts({ activeOnly: true })).toHaveLength(1);
});
```

- [ ] **Step 2: Vérifier l'échec** — Run: `npm test` → FAIL.
- [ ] **Step 3: Implémenter `db.ts` et `repo.ts`**
- [ ] **Step 4: Vérifier** — Run: `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(db): base locale Dexie et outbox`

---

### Task 4: Tokens, thèmes et shell

**Files:**
- Modify: `frontend/app/globals.css`, `frontend/app/layout.tsx`, `frontend/app/page.tsx`
- Create: `frontend/components/layout/AppShell.tsx`, `Rail.tsx`, `Topbar.tsx`, `ThemeToggle.tsx`, `SyncIndicator.tsx`, `frontend/lib/theme.ts`
- Create (pages vides avec leur titre) : `frontend/app/expeditions/page.tsx`, `frontend/app/expedition/page.tsx`, `frontend/app/produits/page.tsx`, `frontend/app/parametres/page.tsx`

**Interfaces:**
- Produces: `<AppShell title: string>{children}</AppShell>` ; `type ThemeMode = 'light' | 'dark' | 'system'` ; `getThemeMode(): ThemeMode`, `setThemeMode(m: ThemeMode): void` (clé `localStorage` `si-theme`, attributs `data-theme` et `data-mode` sur `<html>`).
- `SyncIndicator` lit `db.outbox.count()` avec `useLiveQuery` : 0 → « Enregistré sur cet appareil » ; plus de 0 → « N modification(s) à envoyer ».

- [ ] **Step 1: Lire** `frontend/node_modules/next/dist/docs/01-app` pour : polices (`next/font`), script en ligne dans `layout`, composants client, et l'effet de `cacheComponents: true` sur une page cliente.
- [ ] **Step 2: Tokens** — recopier dans `globals.css` les variables de `:root` et `:root[data-theme=dark]` de la maquette, les exposer à Tailwind par `@theme inline`. Polices Manrope (titres, chiffres) et Inter (texte) via `next/font/google`. Reprendre aussi `::selection`, `caret-color`, `scrollbar-color`, `:focus-visible`.
- [ ] **Step 3: Thème sans flash** — script en ligne dans `<head>` qui applique `data-theme` avant le premier rendu (logique de `applyTheme` de la maquette). Défaut : `light`.
- [ ] **Step 4: Shell** — rail à gauche (Accueil `/`, Historique `/expeditions`, Catalogue `/produits`, Paramètres `/parametres`), qui devient une barre en bas sous 820 px ; topbar avec titre, `SyncIndicator`, `ThemeToggle`. Icônes `lucide-react`.
- [ ] **Step 5: Vérifier dans le navigateur** — Run: `npm run dev`. Attendu : les quatre liens changent de page ; le thème sombre tient après rechargement sans flash clair ; à 375 px la navigation est en bas, sans défilement horizontal.
- [ ] **Step 6: Vérifier le rendu statique** — Run: `npm run build`. Attendu : les cinq routes sont marquées statiques (`○`), aucune dynamique (`ƒ`).
- [ ] **Step 7: Commit** — `feat(ui): tokens, thèmes et shell`

---

### Task 5: Catalogue produits et destinations

**Files:**
- Modify: `frontend/app/produits/page.tsx`, `frontend/app/parametres/page.tsx`
- Create: `frontend/features/products/ProductForm.tsx`, `ProductList.tsx`, `frontend/features/settings/DestinationsEditor.tsx`, `frontend/components/ui/Button.tsx`, `Field.tsx`, `Chip.tsx`, `Panel.tsx`, `SearchInput.tsx`

**Interfaces:**
- Consumes: `saveProduct`, `listProducts`, `saveDestination`, `deleteDestination`, `listDestinations` (Task 3) ; `designation`, `parseWeightToGrams`, `cartonWeightG`, `formatKg` (Tasks 1-2).
- Produces: composants `ui` réutilisés par les Tasks 6 à 8.

- [ ] **Step 1: Catalogue** — reprendre l'écran « Catalogue produits » de la maquette : formulaire à trois champs (nom, poids d'un paquet avec choix kg ou g, paquets par carton), aperçu en direct de la désignation et du poids du carton, bouton désactivé tant que la saisie est invalide ou que la désignation existe déjà ; liste avec recherche et case « Actif ». État vide : « Votre catalogue est vide. Ajoutez votre premier produit avec le formulaire. »
- [ ] **Step 2: Paramètres** — sections Apparence (trois choix), Destinations (ajouter, enlever), Données de cet appareil (texte et avertissement de la maquette, compteur d'outbox).
- [ ] **Step 3: Vérifier dans le navigateur** — créer `PONDU`, `500` g, `30` : l'aperçu affiche « PONDU 500 g × 30 pkts » et « 15 kg par carton ». Créer le même produit une seconde fois : bouton désactivé et message « Ce produit existe déjà dans le catalogue. » Recharger : le produit est toujours là. Ajouter la destination « UK » puis recharger : elle est toujours là.
- [ ] **Step 4: Commit** — `feat: catalogue produits et destinations`

---

### Task 6: Parcours — destination, dates, conteneurs

**Files:**
- Modify: `frontend/app/expedition/page.tsx`
- Create: `frontend/features/shipments/useShipmentDraft.ts`, `Wizard.tsx`, `Stepper.tsx`, `TotalsBar.tsx`, `StepGeneral.tsx`, `StepContainers.tsx`, `ContainerCard.tsx`

**Interfaces:**
- Consumes: opérations de Task 2, `getShipment` / `saveShipment` de Task 3, composants `ui` de Task 5.
- Produces: `useShipmentDraft(id: string): { shipment: Shipment | undefined; update(next: Shipment): void }` — lit par `useLiveQuery`, `update` appelle `saveShipment` immédiatement.
- URL : `/expedition?id=<uuid>&etape=<1-4>`. Sans `id`, la page crée une expédition (`newShipment`), l'enregistre et remplace l'URL.

- [ ] **Step 1: Étape 1** — destinations enregistrées en puces à un clic, champ « Autre destination » qui crée la destination, deux champs de date, avertissement « La date de départ est avant la date de dépôt. Vérifiez les deux dates. »
- [ ] **Step 2: Étape 2** — cartes de conteneur de la maquette : numéro de conteneur, numéro de plomb, case « Dates différentes pour ce conteneur », totaux, boutons dupliquer et supprimer, carte « Ajouter un conteneur ». Supprimer un conteneur qui contient des lignes demande confirmation ; le bouton est désactivé s'il n'en reste qu'un.
- [ ] **Step 3: Barre du bas** — totaux de l'expédition (cartons, kg), « Retour », « Continuer ». Le stepper permet d'aller à n'importe quelle étape.
- [ ] **Step 4: Vérifier dans le navigateur** — créer une expédition, choisir « UK », saisir `HLBU 995319 0` et `HLC 3784425`, dupliquer le conteneur : la copie a ses deux numéros vides. Fermer l'onglet, rouvrir la même URL : tout est là. Dates 13/04/2026 puis 26/03/2026 inversées : l'avertissement s'affiche.
- [ ] **Step 5: Commit** — `feat: parcours de création, étapes 1 et 2`

---

### Task 7: Parcours — marchandises

**Files:**
- Create: `frontend/features/shipments/StepGoods.tsx`, `ProductPicker.tsx`, `ItemRow.tsx`, `QuantityEditor.tsx`, `ContainerTabs.tsx`

**Interfaces:**
- Consumes: `addItem`, `setQuantity`, `removeItem`, `lineWeightG`, `parseQuantity`, `listProducts({ activeOnly: true })`.
- Produces: `<ContainerTabs>` réutilisé par Task 8.

- [ ] **Step 1: Écran** — onglets de conteneur ; à gauche, recherche instantanée et produits actifs ; à droite, lignes du conteneur avec `QuantityEditor` (boutons − et +, champ `inputmode="numeric"`), poids de la ligne, bouton enlever. Choisir un produit déjà présent place le curseur sur sa quantité. Sous 820 px, les deux colonnes s'empilent et chaque ligne devient un bloc.
- [ ] **Step 2: Catalogue vide** — message « Aucun produit dans votre catalogue. » avec un bouton vers `/produits`.
- [ ] **Step 3: Vérifier dans le navigateur** — créer au catalogue les six produits de la fiche de référence (brief §2.5), saisir 381, 104, 590, 42, 143, 153. Attendu dans la barre du bas : **1 413 cartons** et **23 620 kg**. Taper `12,5` dans une quantité : la valeur retenue est 12. Désactiver un produit au catalogue : sa ligne reste dans le conteneur, il disparaît de la liste de gauche.
- [ ] **Step 4: Commit** — `feat: parcours de création, marchandises`

---

### Task 8: Vérification, accueil, historique et reprise

**Files:**
- Modify: `frontend/app/page.tsx`, `frontend/app/expeditions/page.tsx`
- Create: `frontend/features/shipments/StepReview.tsx`, `ShipmentList.tsx`, `frontend/features/shipments/issueText.ts`

**Interfaces:**
- Consumes: `validateShipment`, `Issue`, `duplicateShipment`, `shipmentTotals`, `listShipments`, `saveShipment`.
- Produces: `issueText(i: Issue): string` — textes de la maquette (« La destination n'est pas choisie. », « Conteneur 2 : il manque le numéro de plomb. », etc.).

- [ ] **Step 1: Test de `issueText`** dans `frontend/features/shipments/issueText.test.ts`

```ts
test('textes des alertes', () => {
  expect(issueText({ code: 'destination' })).toBe("La destination n'est pas choisie.");
  expect(issueText({ code: 'seal_number', containerIndex: 1 })).toBe('Conteneur 2 : il manque le numéro de plomb.');
});
```

- [ ] **Step 2: Étape 4** — alertes ou message « Tout est complet. », tableau des totaux par conteneur et total de l'expédition, bouton « Terminer » qui passe le statut à `completed` et revient à l'accueil. Le bouton reste utilisable malgré les alertes : elles informent, elles ne bloquent pas.
- [ ] **Step 3: Accueil** — blocs « Nouvelle expédition » et « Reprendre la dernière » (masqué s'il n'y a aucune expédition), bloc d'état des données, liste des dernières expéditions avec recherche. État vide : « Aucune expédition pour l'instant. Commencez par créer la première. »
- [ ] **Step 4: Historique** — recherche (référence, destination, numéro de conteneur), filtres par statut et destination, bouton « Reprendre » par ligne (`duplicateShipment`, enregistrement, ouverture du parcours) et bouton d'ouverture de l'expédition existante.
- [ ] **Step 5: Vérifier dans le navigateur** — terminer l'expédition de la Task 7 : elle apparaît à l'accueil avec 1 conteneur, 1 413 cartons, « Terminée ». « Reprendre » : une nouvelle expédition s'ouvre avec les six lignes et les numéros vides ; l'ancienne est inchangée dans l'historique. Chercher `HLBU` dans l'historique : l'ancienne est trouvée.
- [ ] **Step 6: Vérification finale** — Run: `npm test && npm run lint && npm run build`. Attendu : tests verts, aucune erreur de lint, cinq routes statiques.
- [ ] **Step 7: Commit** — `feat: vérification, accueil, historique et reprise`

---

## Hors de ce plan

Aperçu documentaire, PDF et Excel (Plan 2) ; service worker et installation (Plan 3) ; compte, serveur, synchronisation et conflits (Plan 4) ; animations Motion et GSAP, vue 3D, filtre par période, modèle de document par entreprise (Plan 5).
