# Soon Inventory — Schémas de données (proposition)

Statut : **proposition à valider**. Rien n'est implémenté.

Principes repris du brief : UUID générés sur l'appareil, isolation par
entreprise, snapshots historiques, poids en grammes entiers, l'expédition
comme unité de synchronisation.

## 1. Vue d'ensemble

```text
companies ─┬─ users ── devices
           ├─ destinations
           ├─ products
           └─ shipments ─┬─ containers ── container_items ──> products
                         └─ documents (instantané figé par version)

processed_operations   idempotence de la synchronisation
audit_logs             trace des modifications importantes
```

Deux représentations du même modèle :

| | PostgreSQL (serveur) | Dexie / IndexedDB (appareil) |
|---|---|---|
| Expédition | 3 tables normalisées | 1 enregistrement, conteneurs et lignes imbriqués |
| Rôle | sauvegarde, validation, recalcul | base de travail, toujours disponible |

L'imbrication locale découle de la règle « l'expédition est l'unité de
synchronisation » : une écriture locale est atomique, l'envoi au serveur
est l'enregistrement tel quel, et la duplication est une copie d'objet.

## 2. PostgreSQL

Toutes les tables ont `created_at timestamptz not null default now()`.
Les tables synchronisées ont en plus les colonnes « sync » :

```sql
version     integer     not null default 1,   -- incrémentée à chaque écriture acceptée
server_seq  bigint      not null,             -- nextval('sync_seq') à chaque écriture
updated_at  timestamptz not null,
deleted_at  timestamptz                        -- suppression synchronisable
```

```sql
create sequence sync_seq;

create table companies (
  id         uuid primary key,
  name       text not null,
  logo_path  text,
  settings   jsonb not null default '{}',     -- modèle documentaire, libellés, couleurs
  updated_at timestamptz not null
);

create table users (
  id            uuid primary key,
  company_id    uuid not null references companies(id),
  email         text not null unique,          -- stocké en minuscules
  password_hash text not null,
  status        text not null default 'active' check (status in ('active','disabled')),
  updated_at    timestamptz not null
);

create table devices (
  id           uuid primary key,               -- généré par l'appareil
  user_id      uuid not null references users(id),
  name         text not null,
  last_seen_at timestamptz
);

create table destinations (
  id           uuid primary key,
  company_id   uuid not null references companies(id),
  name         text not null,
  country_code char(2),
  -- + colonnes sync
  unique (company_id, name)
);

create table products (
  id                        uuid primary key,
  company_id                uuid not null references companies(id),
  name                      text not null,     -- « PONDU »
  designation               text not null,     -- « PONDU 500 g × 30 pkts », libellé du document
  package_weight_g          integer not null check (package_weight_g > 0),
  packages_per_carton       integer not null check (packages_per_carton > 0),
  gross_weight_per_carton_g integer check (gross_weight_per_carton_g > 0),
  weight_type               text not null default 'net' check (weight_type in ('net','gross')),
  unit_label                text not null default 'pkts',
  is_active                 boolean not null default true,
  -- + colonnes sync
  check (weight_type = 'net' or gross_weight_per_carton_g is not null)
);
create unique index on products (company_id, designation) where deleted_at is null;

create table shipments (
  id             uuid primary key,
  company_id     uuid not null references companies(id),
  reference      text not null default '',     -- règle de numérotation non définie (brief §17)
  destination_id uuid references destinations(id),
  depot_date     date,
  departure_date date,
  status         text not null default 'draft'
                 check (status in ('draft','completed','archived')),
  notes          text not null default '',
  device_id      uuid references devices(id),  -- dernier appareil ayant écrit
  -- + colonnes sync
  check (departure_date is null or depot_date is null or departure_date >= depot_date)
);
create index on shipments (company_id, server_seq);

create table containers (
  id                    uuid primary key,
  shipment_id           uuid not null references shipments(id) on delete cascade,
  position              integer not null,
  container_number      text not null default '',
  iso_type_code         text,                  -- « 45R1 », facultatif
  seal_number           text not null default '',
  use_custom_dates      boolean not null default false,
  custom_depot_date     date,
  custom_departure_date date,
  unique (shipment_id, position)
);

create table container_items (
  id                     uuid primary key,
  container_id           uuid not null references containers(id) on delete cascade,
  position               integer not null,
  product_id             uuid not null references products(id),
  product_name_snapshot  text not null,
  designation_snapshot   text not null,
  quantity_cartons       integer not null check (quantity_cartons > 0),
  unit_weight_g_snapshot integer not null check (unit_weight_g_snapshot > 0),
  weight_type_snapshot   text not null check (weight_type_snapshot in ('net','gross')),
  total_weight_g         bigint not null,
  unique (container_id, position),
  unique (container_id, product_id),           -- un produit = une ligne par conteneur (à confirmer)
  check (total_weight_g = quantity_cartons::bigint * unit_weight_g_snapshot)
);

create table documents (
  id               uuid primary key,
  shipment_id      uuid not null references shipments(id),
  container_id     uuid,                       -- null = document global ; pas de FK, le conteneur peut disparaître
  format           text not null check (format in ('pdf','xlsx')),
  version          integer not null,           -- 1, 2, 3… par (expédition, conteneur, format)
  shipment_version integer not null,           -- version de l'expédition au moment de la génération
  snapshot         jsonb not null,             -- données figées : le fichier est régénérable à l'identique
  generated_at     timestamptz not null,
  server_seq       bigint not null
);

create table processed_operations (
  idempotency_key uuid primary key,
  company_id      uuid not null references companies(id),
  device_id       uuid not null references devices(id),
  entity_type     text not null,
  entity_id       uuid not null,
  result          jsonb not null,              -- réponse renvoyée telle quelle si l'opération est rejouée
  processed_at    timestamptz not null default now()
);

create table audit_logs (
  id          bigserial primary key,
  company_id  uuid not null,
  user_id     uuid,
  device_id   uuid,
  action      text not null,
  entity_type text not null,
  entity_id   uuid not null,
  metadata    jsonb not null default '{}'
);
```

### Écarts volontaires par rapport au brief §9

| Écart | Raison |
|---|---|
| Pas de `deleted_at` ni de `version` sur `containers` et `container_items` | Ils voyagent avec l'expédition : le serveur remplace les enfants dans une transaction. La trace reste dans `audit_logs`. |
| `sync_operations` devient `processed_operations` | La file d'attente vit sur l'appareil (outbox). Le serveur ne garde que les clés déjà traitées. |
| Pas de table `sync_cursors` | Le curseur (`server_seq` le plus élevé reçu) est stocké sur l'appareil. |
| `documents.storage_path` remplacé par `snapshot` | Pas de stockage S3 au MVP : le fichier se régénère depuis l'instantané. |
| `destinations.company_id` obligatoire | Pas de destinations globales : chaque entreprise a sa liste. |
| `net_weight_per_carton` absent | Calculé : `package_weight_g × packages_per_carton`. |

### Règles serveur

- `company_id` vient toujours de la session, jamais du corps de la requête.
- À chaque envoi, le serveur recalcule `total_weight_g` et refuse l'expédition si une ligne diffère.
- Un envoi dont la version de base n'est pas la version courante est refusé avec la version serveur : l'appareil affiche le conflit.

## 3. Dexie (appareil)

```ts
db.version(1).stores({
  shipments:    'id, status, updatedAt, destinationId, *containerNumbers',
  products:     'id, designation, isActive',
  destinations: 'id, name',
  documents:    'id, shipmentId, generatedAt',
  outbox:       'id, [entityType+entityId], createdAt',
  meta:         'key',   // curseur de sync, deviceId, session, thème
});
```

```ts
type Grams = number; // entier

type SyncState = 'local' | 'pending' | 'syncing' | 'synced' | 'error' | 'conflict';

interface SyncFields {
  version: number;       // dernière version confirmée par le serveur (0 = jamais envoyée)
  syncState: SyncState;
  updatedAt: string;     // ISO
  deletedAt?: string;
}

interface Shipment extends SyncFields {
  id: string;
  reference: string;
  destinationId?: string;
  depotDate?: string;      // 'YYYY-MM-DD', date sans fuseau
  departureDate?: string;
  status: 'draft' | 'completed' | 'archived';
  notes: string;
  containers: Container[]; // l'ordre du tableau est la position
  containerNumbers: string[]; // index de recherche, dérivé de containers
}

interface Container {
  id: string;
  containerNumber: string;
  isoTypeCode?: string;
  sealNumber: string;
  customDates?: { depotDate?: string; departureDate?: string }; // absent = dates de l'expédition
  items: ContainerItem[];
}

interface ContainerItem {
  id: string;
  productId: string;
  productName: string;      // snapshot
  designation: string;      // snapshot
  quantityCartons: number;
  unitWeightG: Grams;       // snapshot
  weightType: 'net' | 'gross';
}

interface Product extends SyncFields {
  id: string;
  name: string;
  designation: string;
  packageWeightG: Grams;
  packagesPerCarton: number;
  grossWeightPerCartonG?: Grams;
  weightType: 'net' | 'gross';
  unitLabel: string;
  isActive: boolean;
}

interface OutboxEntry {
  id: string;              // clé d'idempotence, renouvelée à chaque modification
  entityType: 'shipment' | 'product' | 'destination' | 'document';
  entityId: string;
  op: 'upsert' | 'delete';
  createdAt: string;
  attempts: number;
  lastError?: string;
}
```

Les totaux (cartons, poids par ligne, par conteneur, par expédition) ne
sont **pas stockés** localement : ils sont calculés par une fonction pure
à partir des lignes. `total_weight_g` n'est ajouté qu'au moment de l'envoi.

L'outbox garde **une entrée par entité modifiée**, pas un journal de
chaque frappe. À l'envoi, on lit l'état courant de l'entité.

## 4. Synchronisation (forme, contrats détaillés à l'étape suivante)

```text
POST /api/v1/sync/push   { deviceId, operations: [{ idempotencyKey, entityType, op, baseVersion, data }] }
                         → par opération : accepted { version, serverSeq } | conflict { serverData } | rejected { errors }

GET  /api/v1/sync/pull?cursor=<serverSeq>
                         → { changes: [...], cursor }
```

## 5. Vérification sur l'exemple réel

| Désignation | Cartons | `unit_weight_g` | `total_weight_g` |
|---|---:|---:|---:|
| LONG BOBOLO 1 kg × 20 pkts | 381 | 20 000 | 7 620 000 |
| ROUND BOBOLO 1 kg × 20 pkts | 104 | 20 000 | 2 080 000 |
| PONDU 1 kg × 15 pkts | 590 | 15 000 | 8 850 000 |
| PONDU 500 g × 30 pkts | 42 | 15 000 | 630 000 |
| SOUR SOUR LEAF 1 kg × 15 pkts | 143 | 15 000 | 2 145 000 |
| PONDU CAOUTCHOUC 1 kg × 15 pkts | 153 | 15 000 | 2 295 000 |
| **Total** | **1 413** | | **23 620 000 g = 23 620 kg** |

## 6. Points à confirmer

1. **Un produit = une ligne par conteneur** (contrainte `unique (container_id, product_id)`), et donc pas de « dupliquer une ligne ».
2. **Statuts** : `draft`, `completed`, `archived`. Une expédition `completed` reste modifiable ; chaque nouvel export crée une nouvelle version de document.
3. **Pas de stockage S3 au MVP** : les documents se régénèrent depuis leur instantané.
4. **Code de type ISO** (`45R1`) en champ facultatif séparé du numéro de conteneur.
5. **Vue 3D** : le modèle n'a ni dimensions de carton ni charge maximale du conteneur. La vue 3D ne peut donc pas montrer un taux de remplissage réel sans ajouter ces champs.
