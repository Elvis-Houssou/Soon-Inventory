# INVENTORY APP --- Cahier de référence produit, UX/UI et technique

> **Document de référence destiné à Claude pour concevoir et construire
> le projet.**\
> Ce document consolide les décisions prises pendant les échanges. Il
> distingue les décisions validées, les recommandations d'implémentation
> et les points métier restant à confirmer.\
> **Langue de l'interface initiale : français.** Prévoir une
> architecture permettant l'internationalisation ultérieure.

------------------------------------------------------------------------

## 0. Instructions générales pour la construction

Construire une application réellement utilisable, et non une simple
maquette de dashboard.

Les priorités, dans cet ordre, sont :

1.  Permettre à une personne peu à l'aise avec l'informatique de créer
    très facilement une fiche d'expédition/inventaire.
2.  Reproduire fidèlement le document opérationnel utilisé actuellement
    par le client.
3.  Gérer un ou plusieurs conteneurs dans une même expédition.
4.  Ajouter les marchandises et calculer automatiquement les cartons et
    le tonnage.
5.  Fonctionner hors ligne, conserver les données localement et
    synchroniser dès que possible.
6.  Générer des fichiers Excel et PDF.
7.  Fournir une interface premium, fluide, animée et adaptée à Android
    comme à Windows.

Ne pas commencer par construire un ERP complet ou un logiciel de gestion
de stock généraliste. Le cœur du produit est **la création, la
vérification, la conservation et l'export de fiches d'expédition**.

Ne pas inventer des fonctionnalités secondaires avant que le workflow
principal soit solide. Ne pas multiplier les graphiques, les cartes KPI
ou les menus sans utilité métier.

------------------------------------------------------------------------

# 1. Vision du produit

## 1.1 Problème à résoudre

Dans l'activité d'import-export, les utilisateurs créent régulièrement
des tableaux Excel récapitulant une expédition ou un dépôt de
marchandises. Les informations changent d'une opération à l'autre, mais
la structure du document reste généralement identique.

Les utilisateurs peuvent avoir des difficultés avec : - l'utilisation
d'un ordinateur ; - Excel et ses formules ; - la saisie répétitive ; -
les calculs de quantités et de poids ; - la mise en forme des documents.

Aujourd'hui, ils doivent renseigner manuellement des informations telles
que : - la destination ; - les dates de dépôt et de départ ; - les
numéros de conteneurs ; - les numéros de plomb ; - les désignations des
marchandises ; - le nombre de cartons ; - le total des cartons ; - le
tonnage total.

## 1.2 Proposition de valeur

**Créer une fiche d'expédition professionnelle en quelques étapes
simples, sans avoir besoin de maîtriser Excel.**

L'utilisateur doit pouvoir : - reprendre une ancienne expédition ; -
créer une nouvelle expédition ; - ajouter un ou plusieurs conteneurs ; -
sélectionner les produits dans un catalogue ; - saisir uniquement les
quantités ; - obtenir les totaux automatiquement ; - prévisualiser le
document ; - exporter en Excel ou PDF ; - travailler même sans connexion
Internet.

## 1.3 Public cible

Public initial : - importateurs et exportateurs ; - responsables ou
employés qui préparent les fiches d'expédition ; - personnes qui
utilisent actuellement Excel ou des documents répétitifs, mais qui ne
sont pas nécessairement à l'aise avec l'informatique.

Hypothèse de fonctionnement retenue pour le MVP : **un utilisateur
principal par entreprise**. L'architecture doit néanmoins permettre
d'ajouter des rôles et plusieurs utilisateurs plus tard.

------------------------------------------------------------------------

# 2. Modèle métier et vocabulaire

## 2.1 Entités principales

Le modèle central n'est pas le conteneur seul. C'est **l'expédition**.

Une expédition contient un ou plusieurs conteneurs. Chaque conteneur
contient son propre inventaire de marchandises.

Hiérarchie :

``` text
Entreprise
└── Expédition
    ├── Informations générales
    ├── Conteneur 1
    │   ├── Informations du conteneur
    │   └── Marchandises
    │       ├── Produit A : quantité
    │       └── Produit B : quantité
    ├── Conteneur 2
    │   ├── Informations du conteneur
    │   └── Marchandises
    │       ├── Produit A : quantité
    │       └── Produit C : quantité
    └── Récapitulatif général
```

Une expédition peut avoir un seul conteneur ou plusieurs conteneurs (2,
3, 5, 10 ou davantage). Ne pas imposer une limite arbitraire faible.

## 2.2 Expédition

Une expédition porte notamment : - une référence interne ; - une
destination ; - une date de dépôt ; - une date de départ ; - un statut
; - une liste de conteneurs ; - les totaux calculés ; - les documents
générés.

Les dates peuvent être communes à l'expédition ou personnalisées pour
chaque conteneur.

### Règle d'héritage des dates

-   Les dates de l'expédition constituent les valeurs par défaut.
-   Chaque conteneur utilise ces dates par défaut.
-   L'utilisateur peut activer une option de dates personnalisées sur un
    conteneur.
-   Si des dates personnalisées sont activées, elles remplacent les
    dates globales pour ce conteneur.
-   L'interface doit clairement distinguer les dates communes des dates
    personnalisées.
-   Une date de départ antérieure à la date de dépôt doit déclencher une
    validation ou un avertissement explicite.

## 2.3 Conteneur

Chaque conteneur appartient à une expédition et possède : - un numéro de
conteneur ; - un numéro de plomb ; - éventuellement ses propres dates
; - une liste de marchandises ; - un total de cartons ; - un tonnage
calculé.

Actions : ajouter, modifier, supprimer, dupliquer un conteneur.

La duplication doit copier les informations utiles et les lignes de
marchandises, mais générer un nouvel identifiant et demander la
vérification des numéros de conteneur et de plomb.

## 2.4 Produits et marchandises

Le catalogue de produits est réutilisable entre les expéditions et les
conteneurs.

Un produit doit pouvoir avoir plusieurs conditionnements. Exemple : -
PONDU 1 kg × 15 paquets ; - PONDU 500 g × 30 paquets.

Ces deux références de conditionnement doivent être traitées comme deux
références de catalogue distinctes, même si le nom commercial est
identique.

Un même produit du catalogue peut être présent dans plusieurs
conteneurs. Les quantités restent indépendantes par conteneur.

Exemple : - Conteneur 1 : 200 cartons de Pondu ; - Conteneur 2 : 150
cartons de Pondu ; - Conteneur 3 : 150 cartons de Pondu ; - Total
expédition : 500 cartons de Pondu.

Le récapitulatif général peut agréger les quantités d'un même produit,
tout en conservant le détail par conteneur.

## 2.5 Tonnage --- règle validée et point à confirmer

Décision prise : le tonnage est calculé automatiquement à partir du
poids unitaire du carton et de la quantité.

Formule :

``` text
Poids total d'une ligne = quantité de cartons × poids d'un carton

Poids total du conteneur = somme des poids de ses lignes

Poids total de l'expédition = somme des poids de ses conteneurs
```

Pour un produit conditionné :

``` text
Poids d'un carton = poids d'un paquet × nombre de paquets par carton
```

Exemple : - PONDU 1 kg × 15 paquets ; - poids par carton = 1 × 15 = 15
kg ; - 590 cartons × 15 kg = 8 850 kg.

### Exemple réel communiqué

  Désignation                           Cartons   Poids par carton     Poids total
  --------------------------------- ----------- ------------------ ---------------
  LONG BOBOLO 1 kg × 20 pkts                381              20 kg        7 620 kg
  ROUND BOBOLO 1 kg × 20 pkts               104              20 kg        2 080 kg
  PONDU 1 kg × 15 pkts                      590              15 kg        8 850 kg
  PONDU 500 g × 30 pkts                      42              15 kg          630 kg
  SOUR SOUR LEAF 1 kg × 15 pkts             143              15 kg        2 145 kg
  PONDU CAOUTCHOUC 1 kg × 15 pkts           153              15 kg        2 295 kg
  **TOTAL**                           **1 413**                      **23 620 kg**

Le calcul correspond exactement au document fourni par le client.

### Point métier non encore confirmé

Il reste à confirmer si le tonnage représente toujours le poids net des
marchandises ou si certains clients doivent utiliser le poids brut
incluant les emballages.

Prévoir un modèle de données suffisamment souple pour distinguer : -
poids net par carton ; - poids brut par carton, si nécessaire ; - type
de poids utilisé dans le document.

Ne pas ajouter arbitrairement le poids des emballages. Tant que le point
n'est pas confirmé, utiliser la règle de poids configurée pour le
produit et afficher clairement le type de poids.

### Règle de stockage des poids (décision validée)

Tous les poids sont stockés et calculés en **grammes entiers**, dans
Dexie comme dans PostgreSQL (`INTEGER` / `BIGINT`). JavaScript et
IndexedDB n'ont pas de type décimal : l'entier en grammes est la seule
représentation exacte commune au frontend et au backend.

-   Aucun flottant, aucun arrondi dans les calculs : uniquement des
    multiplications et additions d'entiers.
-   La conversion en kg n'a lieu qu'à l'affichage et dans les documents
    (`grammes / 1000`, formaté avec séparateur de milliers).
-   La saisie d'un poids accepte « 500 g » ou « 1 kg » et enregistre des
    grammes.

------------------------------------------------------------------------

# 3. Document de référence à reproduire

Une photo fournie par le client montre le document opérationnel actuel.

Informations générales visibles : - DESTINATION : UK - DATE DE DEPOT :
JEUDI, 26/03/2026 - DATE DE DEPART : LUNDI, 13/04/2026 - NUMERO DE PLOMB
: HLC 3784425 - NUMERO CONTENEUR : HLBU 995319 0 45R1

Tableau : - colonne DESIGNATION ; - colonne NOMBRE DE CARTON.

Pied de document : - NOMBRE TOTAL DE CARTON : 1 413 cartons ; - TONNAGE
TOTAL DU CONTENEUR : 23 620 kg.

Le document généré doit rester très proche de cette logique et de cette
présentation. Il ne faut pas imposer au client un format administratif
complètement différent.

Prévoir des modèles de document configurables par entreprise : - logo
; - nom de l'entreprise ; - couleurs ; - en-tête ; - libellés ; -
colonnes ; - pied de page.

Le document doit pouvoir être comparé visuellement au document de
référence. L'aperçu avant export est obligatoire.

## 3.1 Trois formats de sortie

1.  **Fiche individuelle par conteneur** : une fiche contient les
    informations et marchandises d'un seul conteneur.
2.  **Document global** : un document regroupe tous les conteneurs,
    chacun avec son inventaire, puis un récapitulatif général.
3.  **Classeur Excel** : informations générales, détail par conteneur,
    lignes de marchandises et récapitulatif.

Formats prioritaires du MVP : - PDF ; - Excel.

L'export en image et le partage direct peuvent être ajoutés ensuite.

------------------------------------------------------------------------

# 4. Workflow utilisateur principal

L'interface doit guider l'utilisateur sans lui demander de comprendre la
structure technique.

## Étape 0 --- Accueil

Actions principales : - Créer une expédition. - Reprendre une ancienne
expédition. - Consulter les expéditions existantes. - Accéder au
catalogue de produits.

Mettre le bouton « Nouvelle expédition » très en évidence.

Afficher les dernières expéditions avec : - référence ; - destination
; - date ; - nombre de conteneurs ; - nombre de cartons ; - statut.

Ne pas transformer l'accueil en dashboard rempli de graphiques.
L'activité et la création d'une expédition sont prioritaires.

## Étape 1 --- Informations générales

Saisie : - destination (choix rapide parmi les destinations
enregistrées, possibilité d'ajouter une destination) ; - date de dépôt
; - date de départ ; - référence ou commentaire facultatif si utile.

Les destinations fréquentes doivent être accessibles en un clic. Les
dates peuvent être préremplies selon les habitudes, sans inventer de
valeurs métier.

## Étape 2 --- Nombre et configuration des conteneurs

L'utilisateur peut : - commencer avec un conteneur ; - ajouter plusieurs
conteneurs ; - ajouter un conteneur à tout moment ; - dupliquer un
conteneur.

Chaque conteneur reçoit : - numéro de conteneur ; - numéro de plomb ; -
dates héritées ou personnalisées.

## Étape 3 --- Marchandises de chaque conteneur

Pour chaque conteneur : - sélectionner un produit existant ; - créer un
nouveau produit si nécessaire ; - renseigner la quantité de cartons ; -
modifier ou supprimer une ligne ; - dupliquer une ligne ; - voir le
poids unitaire et le poids total calculé.

La saisie doit être très rapide : - recherche instantanée ; - produits
récemment utilisés ou favoris ; - conditionnement affiché sans ambiguïté
; - contrôle numérique tactile ; - ajout de ligne sans navigation
inutile ; - total mis à jour immédiatement.

Si le même produit est ajouté plusieurs fois au même conteneur, proposer
de fusionner les lignes ou éviter les doublons selon une règle
cohérente.

## Étape 4 --- Vérification et récapitulatif

Afficher : - nombre de conteneurs ; - total des cartons par conteneur
; - tonnage par conteneur ; - total global des cartons ; - tonnage
global ; - alertes et informations manquantes.

Les totaux doivent se recalculer automatiquement.

Les calculs côté frontend servent à la réactivité de l'interface, mais
le backend doit aussi recalculer et valider les valeurs à la
synchronisation.

## Étape 5 --- Aperçu et génération documentaire

Présenter le document comme une feuille réelle, avec une
prévisualisation fidèle.

Actions : - revenir modifier ; - générer PDF ; - générer Excel ; -
imprimer ; - éventuellement partager.

Une modification après génération doit produire une nouvelle version du
document, sans effacer l'historique précédent.

## Workflow de reprise

Fonctionnalité très importante : **reprendre une ancienne expédition**.

L'utilisateur choisit une expédition passée. L'application crée une
nouvelle expédition en copiant les éléments utiles : - destination ; -
structure ; - conteneurs comme modèles ; - produits ; - conditionnements
; - lignes et quantités si souhaité.

Les identifiants, références et numéros propres à la nouvelle opération
doivent être régénérés ou vérifiés. Ne jamais modifier l'ancienne
expédition lors de cette opération.

------------------------------------------------------------------------

# 5. Périmètre fonctionnel du MVP

## Inclus dans la V1

-   Authentification simple.
-   Un utilisateur principal par entreprise.
-   Création, consultation, modification et duplication d'expéditions.
-   Gestion d'un ou plusieurs conteneurs.
-   Dates globales et dates personnalisées par conteneur.
-   Catalogue de produits et conditionnements.
-   Marchandises et quantités par conteneur.
-   Calcul automatique des cartons et tonnages.
-   Récapitulatif par conteneur et global.
-   Aperçu documentaire.
-   Export PDF et Excel.
-   Historique et recherche.
-   PWA installable.
-   Enregistrement local hors ligne.
-   Synchronisation lorsque le réseau est disponible.
-   Indicateur clair de l'état de sauvegarde et de synchronisation.

## À reporter après le MVP

-   Reconnaissance vocale.
-   Reconnaissance de produits par photo.
-   OCR des factures et bons de livraison.
-   Assistant IA.
-   Gestion complète des stocks entrants et sortants.
-   Alertes avancées.
-   Gestion de plusieurs rôles et équipes.
-   Tableaux analytiques avancés.
-   Application mobile native distincte.
-   Application desktop distincte.

Ne pas développer ces fonctions avant que le workflow de création de
fiche soit excellent.

------------------------------------------------------------------------

# 6. Plateforme et stratégie Offline-First

## 6.1 Décision plateforme

Construire une **application Web responsive de type PWA Offline-First**.

Cibles : - téléphones Android ; - ordinateurs Windows ; - navigateurs
modernes.

Une seule base de code et une interface adaptée à la taille de l'écran.

Ne pas développer d'application Android native, iOS native ou Desktop
Electron/Tauri pour le MVP.

La PWA doit : - être installable ; - avoir un manifeste et des icônes
; - mettre en cache les ressources nécessaires ; - permettre de
consulter et modifier les données locales ; - générer Excel et PDF sans
Internet lorsque les données sont disponibles localement ; -
synchroniser plus tard.

Attention : le Service Worker ne suffit pas à fournir le mode hors
ligne. La logique de données locale et de synchronisation doit être
développée explicitement.

## 6.2 Source locale et source distante

-   **Dexie / IndexedDB** : base de travail locale sur l'appareil.
-   **PostgreSQL** : stockage central distant et source de sauvegarde.
-   **FastAPI** : validation, synchronisation et règles métier côté
    serveur.

L'utilisateur doit pouvoir créer une expédition sans connexion après
initialisation de son compte et de ses données locales.

Le fonctionnement hors ligne ne doit pas dépendre d'un appel API à
chaque frappe ou à chaque sauvegarde.

## 6.3 Flux de synchronisation

``` text
Utilisateur
   |
   v
Interface Next.js
   |
   v
Service métier frontend
   |
   v
Dexie / IndexedDB
   |
   +----> Données disponibles immédiatement hors ligne
   |
   +----> Outbox : opérations en attente
                 |
                 | réseau disponible
                 v
              FastAPI
                 |
                 v
            PostgreSQL
                 |
                 v
        Accusé de réception
                 |
                 v
      Marquer comme synchronisé
```

Mettre en place un mécanisme Outbox : - chaque opération reçoit un UUID
; - chaque opération possède une clé d'idempotence ; - les opérations
restent en attente jusqu'à confirmation du serveur ; - les échecs réseau
déclenchent des tentatives ultérieures ; - les suppressions sont
synchronisées ; - les opérations ne sont jamais considérées comme
synchronisées avant l'accusé de réception du serveur.

Déclencher la synchronisation : - à l'ouverture de l'application ; - au
retour de la connexion ; - après certaines opérations importantes ; -
périodiquement lorsque l'application est active ; - via un bouton de
synchronisation manuelle.

Ne pas compter uniquement sur Background Sync, dont le support varie
selon les navigateurs.

## 6.4 Conflits

Même avec un utilisateur principal par entreprise, la même personne peut
utiliser plusieurs appareils hors ligne.

### Unité de synchronisation (décision validée)

**L'expédition est l'unité de synchronisation et de conflit.** Une
expédition, ses conteneurs et ses lignes de marchandises forment un seul
agrégat :

-   un seul numéro de `version`, porté par l'expédition ;
-   toute modification d'un conteneur ou d'une ligne incrémente la
    version de l'expédition ;
-   l'agrégat est envoyé et reçu en entier ; le serveur refuse un envoi
    dont la version de base n'est plus la version courante ;
-   les conteneurs et les lignes n'ont pas de version propre.

Les produits du catalogue et les destinations sont des unités
indépendantes, chacune avec sa propre `version`.

Pour la récupération, le serveur attribue à chaque écriture acceptée un
numéro de séquence croissant (`server_seq`). Chaque appareil demande les
changements postérieurs à son dernier curseur.

Prévoir : - date de dernière modification ; - identifiant de
l'appareil ; - détection des mises à jour concurrentes ; - résolution
explicite ou copie conflictuelle ; - aucun écrasement silencieux de
données.

Pour les conflits complexes, demander à l'utilisateur de choisir quelle
version conserver ou de consulter les deux versions.

## 6.5 Risques locaux

-   Demander la persistance du stockage navigateur lorsque disponible.
-   Surveiller l'espace de stockage.
-   Ne pas effacer les données non synchronisées à la déconnexion.
-   Avertir avant une action pouvant supprimer des données locales.
-   Expliquer qu'un appareil détruit avant synchronisation peut
    entraîner la perte des dernières données.
-   Encourager la synchronisation régulière.

------------------------------------------------------------------------

# 7. Stack technologique retenue

## 7.1 Frontend

-   **Next.js 16**
-   React
-   TypeScript
-   App Router
-   Tailwind CSS
-   shadcn/ui, avec personnalisation profonde
-   Radix UI pour les primitives accessibles

## 7.2 Gestion des données et formulaires

-   Zustand : état temporaire des parcours complexes et de l'interface.
-   TanStack Query : communication avec l'API distante, cache réseau et
    invalidation.
-   Dexie.js + IndexedDB : stockage local principal.
-   Dexie LiveQuery : réactivité des données locales.
-   React Hook Form : formulaires.
-   Zod : validation partagée lorsque possible.

Ne pas utiliser Zustand comme base de données. Ne pas utiliser TanStack
Query comme remplacement d'IndexedDB. Séparer clairement les
responsabilités.

## 7.3 PWA

-   Service Worker.
-   Serwist ou solution compatible Next.js pour gérer le Service Worker.
-   Web App Manifest.
-   Cache des ressources de l'application.
-   Stratégies de cache explicites.
-   Dexie pour les données métier locales.

## 7.4 Animations

-   **Motion for React** (anciennement Framer Motion) : transitions
    liées au cycle de vie React (entrée/sortie de composants, layout
    partagé, changement de page et d'étape).
-   **GSAP** (avec `@gsap/react` / `useGSAP`) : séquences chorégraphiées
    et timelines (chiffres animés, révélation du document, indicateur de
    synchronisation, validation).
-   Un élément n'est animé que par une seule des deux librairies, jamais
    les deux à la fois.
-   Animations réutilisables dans des composants dédiés.
-   `prefers-reduced-motion` respecté.
-   Éviter les animations coûteuses qui ralentissent la saisie ou les
    appareils modestes.

## 7.5 Backend

-   FastAPI.
-   Python.
-   SQLAlchemy 2.
-   Pydantic.
-   Alembic.
-   API REST versionnée (`/api/v1/...`).

Architecture monolithique modulaire. Ne pas commencer par des
microservices.

## 7.6 Base de données distante

-   PostgreSQL.

Utiliser des transactions pour les opérations qui modifient plusieurs
entités. Stocker les poids en grammes entiers (voir 2.5). Ajouter des
contraintes et index adaptés. Isoler strictement les données par
entreprise.

## 7.7 Génération documentaire

-   **ExcelJS côté frontend** pour générer les fichiers Excel
    localement, y compris hors ligne.
-   **HTML/CSS + impression navigateur / génération PDF** pour les PDF.
-   Prévoir un rendu documentaire contrôlé et des tests visuels.
-   Stockage objet compatible S3 pour l'archivage distant des documents.

Les documents doivent être générables localement sans connexion dès lors
que les données sont disponibles localement.

## 7.8 Infrastructure

-   Docker pour les environnements de développement et le déploiement.
-   GitHub Actions pour CI/CD.
-   Sentry pour le suivi des erreurs.
-   Stockage objet S3 compatible.
-   PostgreSQL avec sauvegardes automatiques et procédures de
    restauration testées.

Redis est reporté. Ne pas ajouter Celery, Redis ou une infrastructure de
jobs sans besoin réel.

## 7.9 3D et vidéo

-   **Three.js** (avec le connecteur 3D View pour prototyper les
    scènes) : vue 3D du conteneur, là où elle aide à comprendre
    (carte de conteneur ouverte, récapitulatif). Règles :
    -   chargée à la demande, jamais dans le chemin de saisie ;
    -   remplacée par une vue 2D sur appareil modeste, hors ligne sans
        cache, ou avec `prefers-reduced-motion` ;
    -   aucune information n'existe uniquement dans la vue 3D.
-   **HyperFrames** : vidéos produites hors de l'application (tutoriel
    de prise en main, vidéo de présentation). Ce n'est pas une
    dépendance de l'application. À produire une fois le workflow
    principal stable.

### Tableau récapitulatif

  Domaine             Technologie
  ------------------- -----------------------
  Plateforme          PWA Offline-First
  Frontend            Next.js 16
  Langage             TypeScript
  Styles              Tailwind CSS
  Composants          shadcn/ui + Radix
  Animations          Motion + GSAP
  3D                  Three.js (à la demande)
  Vidéo (hors app)    HyperFrames
  Icônes              Lucide React
  État UI             Zustand
  API/cache distant   TanStack Query
  Formulaires         React Hook Form
  Validation          Zod
  Base locale         Dexie / IndexedDB
  Service Worker      Serwist ou équivalent
  Backend             FastAPI
  ORM                 SQLAlchemy 2
  Schémas             Pydantic
  Migrations          Alembic
  Base distante       PostgreSQL
  Excel               ExcelJS
  PDF                 HTML/CSS + impression
  Stockage distant    S3 compatible
  Conteneurs          Docker
  CI/CD               GitHub Actions
  Monitoring          Sentry

------------------------------------------------------------------------

# 8. Architecture logicielle recommandée

## 8.1 Monorepo

``` text
inventory-app/
├── frontend/
│   ├── app/
│   ├── components/
│   ├── features/
│   ├── hooks/
│   ├── stores/
│   ├── lib/
│   │   ├── db/
│   │   ├── sync/
│   │   ├── api/
│   │   └── validators/
│   └── public/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── repositories/
│   │   ├── services/
│   │   ├── core/
│   │   └── middleware/
│   ├── alembic/
│   └── tests/
│
├── infrastructure/
│   └── docker/
│
├── docker-compose.yml
└── README.md
```

## 8.2 Modules frontend

-   `shipments` : création et consultation des expéditions.
-   `containers` : conteneurs et leurs informations.
-   `products` : catalogue et conditionnements.
-   `documents` : aperçu et exports.
-   `synchronization` : état réseau, Outbox, synchronisation et
    conflits.

Séparer : - composants d'interface ; - logique métier ; - accès aux
données locales ; - accès API ; - synchronisation.

## 8.3 Modules backend

-   `auth` ;
-   `companies` ;
-   `destinations` ;
-   `shipments` ;
-   `containers` ;
-   `products` ;
-   `documents` ;
-   `synchronization`.

Chaque module doit avoir des schémas, services et règles de validation
clairs. Éviter les routes qui contiennent toute la logique métier.

------------------------------------------------------------------------

# 9. Modèle de données initial

Proposition de tables relationnelles.

Vocabulaire : le terme technique unique pour « expédition » est
`shipment` (tables, modules, routes, code). Ne pas utiliser `inventory`
pour désigner une expédition.

« Inventaire » désigne le contenu listé et le document produit (fiche
d'inventaire d'un conteneur, inventaire global de l'expédition). C'est
le mot affiché à l'utilisateur dans l'interface et sur les documents,
et le nom du produit (Soon Inventory). Une expédition contient donc
plusieurs inventaires : un par conteneur, plus le récapitulatif.

## 9.1 Tables métier

### companies

-   id (UUID)
-   name
-   logo
-   settings
-   created_at
-   updated_at

### users

-   id (UUID)
-   company_id
-   email ou identifiant de connexion
-   password_hash
-   status
-   created_at
-   updated_at

### destinations

-   id (UUID)
-   company_id (nullable si destinations globales)
-   name
-   country_code
-   version
-   created_at
-   updated_at
-   deleted_at

### shipments

-   id (UUID)
-   company_id
-   reference
-   destination_id
-   depot_date
-   departure_date
-   status (draft, completed, archived, etc.)
-   notes
-   version (version unique de l'agrégat, voir 6.4)
-   created_at
-   updated_at
-   deleted_at

### containers

-   id (UUID)
-   shipment_id
-   position (ordre d'affichage dans l'expédition et les documents)
-   container_number
-   seal_number
-   use_custom_dates
-   custom_depot_date
-   custom_departure_date
-   created_at
-   updated_at
-   deleted_at

### products

Tous les poids sont en grammes entiers (voir 2.5).

-   id (UUID)
-   company_id
-   name
-   designation (libellé affiché, ex. « PONDU 500 g × 30 pkts »)
-   package_weight_g
-   packages_per_carton
-   gross_weight_per_carton_g (nullable)
-   weight_type (net ou brut : poids utilisé dans le document)
-   unit_label
-   is_active
-   version
-   created_at
-   updated_at
-   deleted_at

Le poids net par carton n'est pas stocké : il vaut toujours
`package_weight_g × packages_per_carton`.

### container_items

-   id (UUID)
-   container_id
-   position (ordre de la ligne dans le conteneur et le document)
-   product_id
-   product_name_snapshot
-   designation_snapshot
-   quantity_cartons
-   unit_weight_g_snapshot (poids d'un carton au moment de l'ajout)
-   weight_type_snapshot
-   total_weight_g (= quantity_cartons × unit_weight_g_snapshot)
-   created_at
-   updated_at
-   deleted_at

Les snapshots sont importants : si le nom ou le poids du produit change
dans le catalogue, les anciennes expéditions ne doivent pas changer
rétroactivement.

### documents

-   id (UUID)
-   shipment_id
-   container_id (nullable pour document global)
-   document_type (pdf, xlsx)
-   version
-   storage_path (nullable)
-   local_status
-   generated_at
-   created_at

## 9.2 Tables de synchronisation

### devices

-   id (UUID)
-   user_id
-   device_name
-   last_seen_at
-   created_at

### sync_operations

-   id (UUID)
-   device_id
-   operation_type
-   entity_type
-   entity_id
-   payload
-   idempotency_key
-   status
-   attempt_count
-   created_at
-   processed_at

### sync_cursors

-   id
-   device_id
-   last_server_cursor
-   updated_at

### audit_logs

-   id
-   company_id
-   user_id
-   device_id
-   action
-   entity_type
-   entity_id
-   metadata
-   created_at

Adapter le modèle pendant la conception détaillée, mais conserver les
principes : - UUID générés localement ; - séparation stricte par
entreprise ; - snapshots historiques ; - versioning ; - suppression
synchronisable ; - idempotence.

------------------------------------------------------------------------

# 10. Design system et direction artistique

## 10.1 Direction validée

Nom de direction : **Industrial Premium / Modern Logistics**.

Les deux images de référence fournies par le client montrent : 1. une
interface logistique sombre avec des accents orange, une navigation
latérale compacte, des panneaux graphite et une esthétique industrielle
; 2. un dashboard d'opérations sombre, modulaire, avec de grands
panneaux arrondis et un accent jaune/vert fluorescent.

La direction finale doit s'inspirer de ces références sans les copier.

Éviter absolument : - le dashboard SaaS générique ; - les cartes
blanches répétitives avec une icône colorée ; - les graphiques
décoratifs ; - les gradients violets/bleus typiques des interfaces
générées par IA ; - les formulaires sans personnalité ; - la surcharge
d'éléments ; - les animations gadgets sans fonction.

## 10.2 Palette proposée

  -----------------------------------------------------------------------
  Token                   Couleur                 Usage
  ----------------------- ----------------------- -----------------------
  Graphite                `#191A1F`               Sidebar, surfaces
                                                  sombres

  Panel                   `#292A30`               Panneaux sombres

  Cargo Orange            `#F47B20`               Actions principales,
                                                  sélection

  Signal Lime             `#D9F75C`               Validation,
                                                  synchronisation
                                                  réussie, signal

  Light Canvas            `#F4F4F2`               Fond du thème clair

  White                   `#FFFFFF`               Surfaces et documents
  -----------------------------------------------------------------------

Règles : - Thème clair principalement. - Thème sombre disponible. - Mode
système disponible et suit les préférences de l'appareil. - Le thème
clair utilise une navigation graphite afin de conserver l'identité
visuelle. - Orange réservé aux actions et éléments actifs. - Lime
utilisé avec parcimonie. - Contrastes accessibles dans les deux
thèmes. - Utiliser des variables CSS / tokens, pas des couleurs
dispersées dans les composants.

## 10.3 Typographie

Proposition : - Manrope pour les titres et l'interface. - Inter pour les
textes et informations secondaires. - Chiffres tabulaires pour les
quantités, poids et totaux.

Les nombres doivent être immédiatement lisibles. Prévoir un formatage
cohérent des milliers, décimales, unités et dates.

## 10.4 Layout desktop

-   Sidebar sombre, compacte et persistante.
-   Topbar avec recherche, état de synchronisation, profil et
    paramètres.
-   Zone centrale claire en thème clair.
-   Panneaux latéraux contextuels lorsque utiles.
-   Grille et espacements cohérents.
-   Densité équilibrée et aérée, mais informations rapidement
    accessibles.
-   Ne pas gaspiller l'espace disponible : les tableaux de marchandises
    doivent rester efficaces.

## 10.5 Layout mobile

-   Navigation adaptée au tactile.
-   Actions principales faciles à atteindre.
-   Champs numériques confortables.
-   Pas de tableau desktop simplement rétréci : convertir les lignes en
    éléments adaptés au mobile.
-   Panneaux empilés et résumés visibles.
-   Éviter les interactions qui exigent un survol, puisque le tactile
    n'a pas de hover.

## 10.6 Thèmes

Prévoir trois modes : - Light ; - Dark ; - System.

Le mode par défaut est Light. Le mode System suit
`prefers-color-scheme`. Persister la préférence localement et éviter un
flash de mauvais thème au chargement.

------------------------------------------------------------------------

# 11. UX/UI --- principes non négociables

1.  Une action principale clairement identifiable sur chaque écran.
2.  Aucun formulaire inutilement long.
3.  Les champs numériques sont faciles à utiliser au clavier et au
    tactile.
4.  Les erreurs sont expliquées avec des mots simples.
5.  Les informations importantes sont visibles rapidement.
6.  Les actions sont réversibles autant que possible.
7.  Sauvegarde locale automatique.
8.  Indicateur permanent de l'état local / synchronisé.
9.  Interface utilisable avec de nombreuses marchandises.
10. Les animations améliorent la compréhension, jamais au détriment de
    la vitesse.
11. L'utilisateur ne doit pas avoir besoin de comprendre Excel.
12. Le glisser-déposer peut exister comme interaction secondaire, mais
    ne doit jamais être obligatoire.
13. Prévoir de gros boutons et des zones tactiles adaptées.
14. Toujours confirmer les suppressions importantes et permettre
    l'annulation lorsque possible.
15. Les états vides doivent guider l'utilisateur vers l'action suivante.

## 11.1 Écrans à concevoir

### Écran 1 --- Accueil

Contenu : - salutation et contexte ; - bouton principal « Nouvelle
expédition » ; - dernières expéditions ; - statut de synchronisation ; -
raccourci vers les produits.

L'accueil doit être centré sur le travail, pas sur des statistiques
décoratives.

### Écran 2 --- Création d'expédition

Workflow guidé avec progression : 1. destination et dates ; 2.
conteneurs ; 3. marchandises ; 4. récapitulatif.

Transition fluide entre les étapes et conservation des données à chaque
étape.

### Écran 3 --- Conteneurs

Présenter les conteneurs comme des cartes industrielles premium, avec
: - numéro de conteneur ; - numéro de plomb ; - dates ; - nombre de
cartons ; - tonnage ; - actions de modification, duplication et
suppression.

Les cartes peuvent s'agrandir pour révéler leur contenu. Éviter de
transformer la métaphore visuelle en décoration encombrante.

### Écran 4 --- Marchandises

Desktop : - catalogue/recherche à gauche ; - lignes sélectionnées et
quantités à droite ; - résumé des cartons et poids visible.

Mobile : - vues adaptées et séquentielles ; - ajout rapide ; - éditeur
de quantité tactile ; - résumé accessible.

Fonctions : - recherche instantanée ; - favoris/récents ; - sélection du
conditionnement ; - saisie des cartons ; - modification directe ; -
ajout sans changement de page ; - poids calculé en temps réel.

### Écran 5 --- Récapitulatif

-   totaux par conteneur ;
-   total global ;
-   alertes ;
-   vérification des informations ;
-   retour facile vers les étapes précédentes.

### Écran 6 --- Aperçu documentaire

-   feuille fidèle au document de référence ;
-   aperçu par conteneur ;
-   aperçu global ;
-   exports Excel et PDF ;
-   impression ;
-   version du document.

### Écran 7 --- Historique

-   recherche ;
-   filtres par destination, période et statut ;
-   consultation ;
-   duplication ;
-   modification si autorisée ;
-   téléchargement des documents.

### Écran 8 --- Catalogue produits

-   recherche ;
-   création et modification ;
-   conditionnements ;
-   poids par carton ;
-   statut actif/inactif ;
-   historique d'utilisation si utile.

### Écran 9 --- Paramètres

-   profil et entreprise ;
-   apparence Light/Dark/System ;
-   modèle documentaire ;
-   destinations ;
-   sauvegarde et synchronisation ;
-   paramètres de données locales.

------------------------------------------------------------------------

# 12. Motion design et interactions

Le client souhaite une intensité **expressive**, avec des transitions
spring, des chiffres animés et des interactions visuelles plus
spectaculaires.

Motion for React et GSAP sont retenus, avec la répartition décrite en
7.4.

Créer un système de composants réutilisables, plutôt que d'ajouter des
animations indépendantes partout.

## 12.1 Composants Motion proposés

-   `PageTransition`
-   `Reveal`
-   `StaggerContainer`
-   `AnimatedNumber`
-   `SharedLayout`
-   `AnimatedProductRow`
-   `ContainerCard`
-   `QuantityEditor`
-   `DocumentReveal`
-   `SyncIndicator`

## 12.2 Interactions attendues

  Interaction                Comportement
  -------------------------- ---------------------------------
  Ouverture de page          Fade + léger déplacement
  Navigation entre étapes    Slide horizontal avec spring
  Ajout d'un produit         Insertion fluide
  Suppression d'une ligne    Collapse progressif
  Mise à jour des totaux     Chiffres animés
  Ouverture d'un conteneur   Expansion spring
  Survol d'une carte         Élévation subtile sur desktop
  Validation                 Check animé
  Aperçu documentaire        Transition vers la feuille
  Synchronisation            Indicateur animé et progression

Durées indicatives : - micro-interactions : 120--200 ms ; - transitions
usuelles : 180--350 ms ; - transitions expressives : 350--550 ms.

Ne pas bloquer les interactions pendant une animation. Respecter
`prefers-reduced-motion`. Privilégier transform et opacity pour les
performances. Tester sur des téléphones Android modestes.

------------------------------------------------------------------------

# 13. Bibliothèque de composants UI

Technologies : - shadcn/ui ; - Radix UI ; - Tailwind CSS ; - Lucide
React ; - Motion ; - GSAP.

shadcn/ui fournit des primitives, mais tous les composants doivent être
stylisés selon le design system Industrial Premium.

Structure proposée :

``` text
components/
├── ui/
│   ├── Button
│   ├── Input
│   ├── Dialog
│   ├── DatePicker
│   ├── NumericInput
│   ├── Select
│   └── Tooltip
│
├── motion/
│   ├── PageTransition
│   ├── Reveal
│   ├── AnimatedNumber
│   ├── StaggerContainer
│   └── SharedLayout
│
├── shipment/
│   ├── ShipmentCard
│   ├── ContainerCard
│   ├── ProductRow
│   ├── ProductSelector
│   ├── QuantityEditor
│   └── ShipmentSummary
│
├── documents/
│   ├── DocumentPreview
│   ├── ExcelExport
│   └── PdfExport
│
└── layout/
    ├── Sidebar
    ├── Topbar
    ├── MobileNavigation
    └── SyncIndicator
```

Librairies complémentaires retenues : - TanStack Table pour les tableaux
avancés si nécessaire ; - date-fns pour les dates ; - Sonner pour les
notifications ; - cmdk / Command pour les recherches et palettes de
commandes.

Ne pas installer une librairie si un composant simple maison suffit.

------------------------------------------------------------------------

# 14. Sécurité et fiabilité

-   Authentification sécurisée.
-   Cookies HttpOnly, Secure et SameSite lorsque l'architecture
    d'authentification le permet.
-   Gestion des sessions et renouvellement sécurisé.
-   Hashage robuste des mots de passe.
-   Contrôle d'accès par entreprise côté backend.
-   Ne jamais faire confiance au `company_id` envoyé par le frontend
    sans vérifier les permissions.
-   Validation Pydantic côté backend.
-   Validation Zod côté frontend.
-   Protection contre les doublons de synchronisation via idempotence.
-   Audit des modifications importantes.
-   Sauvegardes PostgreSQL automatiques.
-   Tests de restauration.
-   Ne jamais supprimer les données locales non synchronisées sans
    avertissement.
-   Ne pas stocker de secrets dans le frontend.
-   HTTPS en production.

L'application doit toujours distinguer : - enregistré localement ; - en
attente de synchronisation ; - synchronisation en cours ; - synchronisé
; - erreur de synchronisation.

------------------------------------------------------------------------

# 15. Tests obligatoires

## Tests métier

-   Une expédition avec un conteneur.
-   Une expédition avec plusieurs conteneurs.
-   Dates communes.
-   Dates personnalisées sur un seul conteneur.
-   Dates personnalisées sur plusieurs conteneurs.
-   Produit réparti entre plusieurs conteneurs.
-   Plusieurs conditionnements pour un même nom commercial.
-   Calcul de cartons.
-   Calcul du poids par ligne.
-   Calcul du poids par conteneur.
-   Calcul du poids global.
-   Modification du poids d'un produit sans altérer l'historique.
-   Duplication d'une expédition.
-   Suppression d'une ligne ou d'un conteneur.

## Tests hors ligne

-   Ouverture après une première installation et initialisation.
-   Création sans Internet.
-   Fermeture et réouverture de l'application.
-   Conservation des données.
-   Génération Excel hors ligne.
-   Génération PDF hors ligne.
-   Retour de la connexion.
-   Synchronisation réussie.
-   Échec réseau et nouvelle tentative.
-   Opération envoyée deux fois sans doublon.
-   Conflit entre deux appareils.
-   Suppression hors ligne puis synchronisation.
-   Protection des données en attente lors de la déconnexion.

## Tests UX et responsive

-   Android petit écran.
-   Android grand écran.
-   Windows desktop.
-   Utilisation tactile.
-   Utilisation clavier/souris.
-   Thème clair.
-   Thème sombre.
-   Thème système.
-   Réduction des animations.
-   Accessibilité clavier et contrastes.
-   Saisie avec un grand nombre de produits.

## Tests documentaires

-   Comparaison visuelle avec le document de référence.
-   Total cartons exact.
-   Tonnage exact.
-   Pagination PDF.
-   Largeur des colonnes Excel.
-   Libellés et unités.
-   Plusieurs conteneurs dans un document global.
-   Fiche individuelle par conteneur.

------------------------------------------------------------------------

# 16. Roadmap de développement

## Phase 1 --- Fondations

-   Initialisation du monorepo.
-   Next.js et FastAPI.
-   PostgreSQL.
-   Docker.
-   Authentification.
-   Modèle de données.
-   Design tokens.
-   Shell de l'application.
-   Configuration PWA de base.

## Phase 2 --- Métier principal

-   Catalogue produits.
-   Création d'expédition.
-   Dates globales et personnalisées.
-   Gestion des conteneurs.
-   Marchandises par conteneur.
-   Calcul automatique.
-   Historique.
-   Duplication.

## Phase 3 --- Documents

-   Modèle de fiche individuel.
-   Modèle global.
-   Aperçu.
-   Export Excel avec ExcelJS.
-   Export PDF.
-   Tests de fidélité visuelle.

## Phase 4 --- Offline-First

-   Dexie.
-   Schéma local et migrations.
-   Enregistrement local automatique.
-   Outbox.
-   API de synchronisation.
-   Idempotence.
-   Versioning.
-   Gestion des conflits.
-   Indicateur de synchronisation.

## Phase 5 --- Finition et lancement

-   Responsive complet.
-   Animations Motion et GSAP.
-   Thèmes.
-   Tests Android et Windows.
-   Tests hors ligne.
-   Sécurité.
-   Monitoring.
-   Sauvegardes.
-   Déploiement.

**Important :** commencer à tester le stockage local et les contraintes
PWA dès les premières phases. Ne pas attendre la phase 4 pour découvrir
que l'architecture frontend ne permet pas le mode hors ligne.

------------------------------------------------------------------------

# 17. Décisions prises et points encore ouverts

## Décisions validées

-   Produit centré sur la création de fiches d'expédition.
-   Une expédition peut contenir un ou plusieurs conteneurs.
-   Dates communes ou dates personnalisées par conteneur.
-   Chaque conteneur possède son inventaire de marchandises.
-   Un produit peut être réparti entre plusieurs conteneurs.
-   Le catalogue de produits est réutilisable.
-   Tonnage calculé automatiquement à partir du conditionnement.
-   Fiche individuelle et document global.
-   Export Excel et PDF.
-   Reprise/duplication d'anciennes expéditions.
-   Application Web PWA Offline-First.
-   Android et Windows.
-   Un utilisateur principal par entreprise pour le MVP.
-   Next.js, FastAPI, PostgreSQL et Dexie.
-   Synchronisation par Outbox.
-   Direction graphique Industrial Premium / Modern Logistics.
-   Thème clair par défaut, sombre et système disponibles.
-   Animations expressives avec Motion et GSAP.
-   Poids stockés en grammes entiers.
-   L'expédition est l'unité de synchronisation (version unique).
-   Terme technique unique : `shipment`.
-   Densité équilibrée et aérée.
-   Pas d'esthétique SaaS générique.

## Points à confirmer ultérieurement

1.  Le tonnage correspond-il toujours au poids net, ou faut-il gérer
    poids brut et poids net ?
2.  Le nom définitif de l'application n'est pas choisi.
3.  Les modèles exacts de documents et les éventuelles variantes propres
    à chaque entreprise doivent être collectés.
4.  Les champs obligatoires et facultatifs du document final devront
    être validés avec un utilisateur métier.
5.  La règle de numérotation des expéditions reste à définir.
6.  Les modalités de sauvegarde, de conservation et de restauration des
    données devront être précisées.
7.  Les besoins de plusieurs utilisateurs par entreprise pourront être
    réévalués après le MVP.

Ne pas prendre de décision arbitraire sur ces points lorsqu'elle
pourrait modifier le document métier ou les données.

------------------------------------------------------------------------

# 18. Consignes finales à Claude

Avant d'implémenter : 1. Lire intégralement ce document. 2. Reformuler
le modèle métier et signaler toute ambiguïté. 3. Proposer le schéma
relationnel détaillé. 4. Définir les contrats API. 5. Définir le modèle
local Dexie et la stratégie de synchronisation. 6. Concevoir les design
tokens et le shell visuel. 7. Présenter une première maquette
fonctionnelle de l'accueil et du workflow de création. 8. Ne commencer
l'implémentation complète qu'après validation de ces fondations.

Pendant le développement : - privilégier du code TypeScript strict ; -
utiliser des composants réutilisables ; - séparer UI, métier, stockage
local et API ; - tester les calculs métier ; - tester les opérations
hors ligne ; - ne jamais sacrifier la simplicité utilisateur à la
sophistication technique ; - ne pas ajouter de fonctionnalités non
demandées sans les justifier ; - ne pas remplacer la référence
documentaire du client par un format arbitraire ; - ne pas produire un
dashboard générique ; - maintenir la cohérence du design system ; -
documenter les décisions techniques importantes.

## Critère de réussite principal

Une personne peu à l'aise avec l'informatique doit pouvoir créer une
expédition, ajouter un ou plusieurs conteneurs, saisir les marchandises,
obtenir les cartons et le tonnage calculés, puis générer son document
Excel ou PDF sans avoir à utiliser Excel elle-même.

**La réussite du projet se mesure d'abord à la simplicité, à la
fiabilité et à la fidélité du document généré --- pas au nombre de
fonctionnalités ou à la complexité de la stack.**
