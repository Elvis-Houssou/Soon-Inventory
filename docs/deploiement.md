# Mise en ligne de Soon Inventory

Le serveur va sur Render, l'application sur Vercel. Les deux se déploient depuis la branche `main` du dépôt GitHub, puis se redéploient seuls à chaque nouveau commit.

Faites Render en premier : Vercel a besoin de l'adresse du serveur.

## Avant de commencer : changer le mot de passe Neon

Dans le tableau de bord Neon, ouvrez le projet, puis **Roles** → `neondb_owner` → **Reset password**. Copiez la nouvelle chaîne de connexion (bouton **Connect**) : c'est elle que vous collerez dans Render, et dans `backend/.env` pour travailler en local.

## 1. Le serveur sur Render

1. Sur [dashboard.render.com](https://dashboard.render.com), cliquez **New** → **Blueprint**.
2. Choisissez le dépôt `Soon-Inventory`. Render lit le fichier `render.yaml` et propose le service `soon-inventory-api`.
3. Render demande une seule valeur, `DATABASE_URL` : collez la chaîne de connexion Neon.
4. Cliquez **Apply**. Le premier déploiement prend quelques minutes.
5. Notez l'adresse du service, de la forme `https://soon-inventory-api.onrender.com`.
6. Vérifiez : ouvrez cette adresse suivie de `/health`. La page doit afficher `{"status":"ok"}`.

Les autres réglages sont déjà dans `render.yaml` : la clé secrète est générée par Render, les tables sont mises à jour à chaque démarrage.

## 2. L'application sur Vercel

1. Sur [vercel.com/new](https://vercel.com/new), importez le dépôt `Soon-Inventory`.
2. **Root Directory** : choisissez `frontend`. Vercel reconnaît Next.js, ne changez pas les commandes.
3. Dans **Environment Variables**, ajoutez une variable :
   - nom : `API_ORIGIN`
   - valeur : l'adresse Render notée plus haut, sans barre à la fin.
4. Cliquez **Deploy**.

## 3. Vérifier

1. Ouvrez l'adresse Vercel, puis **Paramètres** → **Créer un compte**.
2. L'indicateur en haut doit passer à « Sauvegardé sur le serveur ».
3. Ouvrez la même adresse sur un téléphone, connectez-vous : vos fiches doivent apparaître.

## À savoir

- **Offre gratuite de Render** : le serveur s'endort après 15 minutes sans visite. La première synchronisation suivante peut prendre près d'une minute ; l'application reste utilisable pendant ce temps, les fiches sont sur l'appareil.
- **Si l'adresse Render change**, modifiez `API_ORIGIN` dans Vercel puis relancez un déploiement : la valeur est lue au moment du build.
- **Cache hors ligne** : la liste des fichiers est produite pendant le build (`/precache.json`).
- **L'application appelle `/api/...` sur son propre domaine**, et Vercel relaie vers Render. Il n'y a donc rien à régler côté CORS.
