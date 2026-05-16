# 🐳 Guide de Mise en Place Docker (NestJS + Prisma 7 + PostgreSQL)

Ce guide détaille les étapes suivies pour conteneuriser l'application, incluant les configurations spécifiques à Prisma 7 et les solutions aux problèmes rencontrés.

---

## 1. Création du Dockerfile (Multi-stage)

Pour optimiser la taille de l'image et la sécurité, nous utilisons un build en deux étapes.

```dockerfile
# ----- Stage 1: Build -----
FROM node:22-alpine AS builder

WORKDIR /app

# Copie des fichiers de config pour l'installation
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci

# Génération du client Prisma (nécessaire avant le build)
RUN npx prisma generate

# Copie du reste du code et build
COPY . .
RUN npm run build

# ----- Stage 2: Production -----
FROM node:22-alpine

WORKDIR /app

# Récupération uniquement du nécessaire depuis le builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY docker-entrypoint.sh ./

EXPOSE 3000

# Utilisation du script d'entrée pour les tâches au démarrage
ENTRYPOINT ["./docker-entrypoint.sh"]
```

> [!NOTE]
> **Pourquoi Node 22 ?** Prisma 7 requiert une version de Node.js récente (`^20.19` ou `^22.12+`).

---

## 2. Configuration de Docker Compose

Le fichier `docker-compose.yml` orchestre l'API et la base de données.

```yaml
services:
  db:
    image: postgres:15
    container_name: postgres_db
    restart: always
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: task_manager_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user -d task_manager_db"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build: .
    container_name: nestjs_api
    restart: always
    ports:
      - "3000:3000"
    environment:
      # Utilisation du nom du service 'db' comme hôte
      DATABASE_URL: "postgresql://user:pass@db:5432/task_manager_db?schema=public"
    depends_on:
      db:
        condition: service_healthy

volumes:
  postgres_data:
```

---

## 3. Automatisation avec docker-entrypoint.sh

Pour éviter de devoir lancer manuellement `npx prisma db push` à chaque déploiement, nous utilisons un script d'entrée.

```bash
#!/bin/sh
set -e

echo "Running Prisma db push..."
npx prisma db push

echo "Starting application..."
exec node dist/src/main
```

> [!IMPORTANT]
> N'oubliez pas de rendre le script exécutable sur votre machine hôte :
> `chmod +x docker-entrypoint.sh`

---

## 4. Optimisation avec .dockerignore

Pour éviter d'envoyer des fichiers inutiles au démon Docker.

```text
node_modules
dist
.env
Dockerfile
docker-compose.yml
.git
.dockerignore
```

---

## 5. Guide de Debug — Problèmes rencontrés

### ❌ Erreur : `Cannot find module '/app/dist/main'`

**Cause** : Dans la configuration NestJS (tsconfig), le `baseUrl` est `./` et le code source est dans `src/`. Lors du build, la structure est préservée : le fichier `main.js` se retrouve donc dans `dist/src/main.js` et non à la racine de `dist/`.

**Solution** : Mettre à jour l'entrypoint et le script `start:prod` dans `package.json` :
```json
"start:prod": "node dist/src/main"
```

---

### ❌ Erreur : `unknown or unexpected option: --skip-generate`

**Cause** : La commande `npx prisma db push --skip-generate` a été utilisée dans l'entrypoint, mais cette option n'est pas supportée par Prisma 7 pour cette commande spécifique.

**Solution** : Utiliser simplement `npx prisma db push`.

---

### ❌ Erreur : `PrismaClientKnownRequestError: The table public.Task does not exist`

**Cause** : L'API démarre et tente de requêter la base de données PostgreSQL de Docker avant que les tables n'aient été créées.

**Solution** :
1.  Ajout d'un `healthcheck` sur le service `db` dans Docker Compose.
2.  Utilisation de `condition: service_healthy` dans le `depends_on` de l'API.
3.  Utilisation du script `docker-entrypoint.sh` qui exécute `npx prisma db push` avant de lancer l'application.

---

### ❌ Erreur : `listen EADDRINUSE: address already in use :::3000`

**Cause** : Une instance de l'application (en local ou un ancien conteneur mal arrêté) occupe déjà le port 3000.

**Solution** : 
```bash
docker compose down
# Et si nécessaire pour le local :
kill $(lsof -t -i:3000)
```

---

## 6. Commandes utiles

| Commande | Action |
|----------|---------|
| `docker compose up --build -d` | Build et lance les conteneurs en arrière-plan |
| `docker compose logs -f api` | Voir les logs de l'API en temps réel |
| `docker compose ps` | Vérifier l'état des conteneurs |
| `docker compose down -v` | Arrête les conteneurs et supprime les volumes (données DB) |
| `docker exec -it nestjs_api sh` | Entrer dans le conteneur API |
