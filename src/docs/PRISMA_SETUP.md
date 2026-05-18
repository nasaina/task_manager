# 🗄️ Mise en place de Prisma 7 + PostgreSQL dans NestJS

> Guide complet basé sur l'expérience réelle de configuration, incluant tous les problèmes rencontrés et leurs solutions.

---

## Table des matières

1. [Installation des dépendances](#1-installation-des-dépendances)
2. [Configuration du Schema Prisma](#2-configuration-du-schema-prisma)
3. [Configuration de prisma.config.ts](#3-configuration-de-prismaconfigts)
4. [Variables d'environnement (.env)](#4-variables-denvironnement-env)
5. [Création du PrismaService](#5-création-du-prismaservice)
6. [Création du PrismaModule](#6-création-du-prismamodule)
7. [Intégration dans AppModule](#7-intégration-dans-appmodule)
8. [Chargement des variables d'environnement](#8-chargement-des-variables-denvironnement)
9. [Utilisation dans un Service (exemple TasksService)](#9-utilisation-dans-un-service)
10. [Lancer la base de données locale](#10-lancer-la-base-de-données-locale)
11. [Synchroniser le schema avec la DB](#11-synchroniser-le-schema-avec-la-db)
12. [Guide de Debug — Erreurs courantes](#12-guide-de-debug--erreurs-courantes)

---

## 1. Installation des dépendances

```bash
# Prisma CLI (dev dependency)
npm install -D prisma

# Prisma Client + Driver Adapter pour PostgreSQL
npm install @prisma/client @prisma/adapter-pg pg

# Types pour pg
npm install -D @types/pg

# dotenv pour charger les variables d'environnement
npm install dotenv
```

> [!IMPORTANT]
> En **Prisma 7**, le client ne contient plus de driver intégré. Il faut obligatoirement installer un **driver adapter** (`@prisma/adapter-pg` pour PostgreSQL).

---

## 2. Configuration du Schema Prisma

Fichier : `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model Task {
  id          String   @id @default(cuid())
  title       String
  description String?
  status      String   @default("PENDING")
}
```

> [!WARNING]
> **Prisma 7 — Ne PAS mettre `url` dans le datasource !**
> La propriété `url` dans le bloc `datasource` n'est plus supportée en Prisma 7.
> L'URL de connexion se configure dans `prisma.config.ts`.
>
> ❌ Ceci provoque l'erreur **P1012** :
> ```prisma
> datasource db {
>   provider = "postgresql"
>   url      = env("DATABASE_URL")  // INTERDIT en Prisma 7
> }
> ```

---

## 3. Configuration de prisma.config.ts

Fichier : `prisma.config.ts` (à la racine du projet)

```typescript
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
```

> [!NOTE]
> Ce fichier est utilisé par le **CLI Prisma** (migrations, db push, generate).
> Le **PrismaClient** dans votre app utilise quant à lui l'adapter configuré dans `PrismaService`.

---

## 4. Variables d'environnement (.env)

Fichier : `.env`

```env
# URL de connexion directe TCP (pour le driver adapter pg)
DATABASE_URL="postgres://postgres:postgres@localhost:51214/template1?sslmode=disable"
```

> [!IMPORTANT]
> **Deux types d'URLs existent :**
>
> | Type | Format | Usage |
> |------|--------|-------|
> | **TCP directe** | `postgres://user:pass@host:port/db` | Avec `@prisma/adapter-pg` (driver adapter) |
> | **Prisma Postgres** | `prisma+postgres://localhost:51213/?api_key=...` | Avec `accelerateUrl` (proxy HTTP) |
>
> Pour une connexion locale simple, préférez l'**URL TCP directe**.

---

## 5. Création du PrismaService

Fichier : `src/prisma/prisma.service.ts`

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
```

> [!NOTE]
> **Pourquoi `PrismaPg` adapter ?**
> En Prisma 7, le constructeur de `PrismaClient` exige soit un `adapter` (connexion TCP directe) soit un `accelerateUrl` (proxy Prisma). L'ancien pattern avec `datasources: { db: { url: ... } }` **n'existe plus**.

---

## 6. Création du PrismaModule

Fichier : `src/prisma/prisma.module.ts`

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

> [!TIP]
> Le décorateur `@Global()` rend `PrismaService` disponible dans **tous les modules** sans avoir à l'importer explicitement dans chacun.

---

## 7. Intégration dans AppModule

Fichier : `src/app.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TasksModule } from './tasks/tasks.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [TasksModule, PrismaModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

---

## 8. Chargement des variables d'environnement

Fichier : `src/main.ts`

```typescript
import 'dotenv/config';  // ← DOIT être la première ligne
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

> [!CAUTION]
> Si `import 'dotenv/config'` n'est pas présent, `process.env.DATABASE_URL` sera `undefined` au moment où `PrismaService` est instancié, ce qui provoque l'erreur :
> ```
> PrismaClientConstructorValidationError: Using engine type "client"
> requires either "adapter" or "accelerateUrl" to be provided
> ```

---

## 9. Utilisation dans un Service

Fichier : `src/tasks/tasks.service.ts`

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Task } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    // ID personnalisé avec Math.random()
    const id = Math.random().toString(36).substring(2, 9);
    return this.prisma.task.create({
      data: {
        id,
        ...createTaskDto,
      },
    });
  }

  async findAll(): Promise<Task[]> {
    return this.prisma.task.findMany();
  }

  async findOne(id: string): Promise<Task> {
    const task = await this.prisma.task.findUnique({
      where: { id },
    });
    if (!task) {
      throw new NotFoundException(`The task ${id} is not found.`);
    }
    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    await this.findOne(id);
    return this.prisma.task.update({
      where: { id },
      data: updateTaskDto,
    });
  }

  async remove(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    await this.prisma.task.delete({
      where: { id },
    });
    return { message: `The task ${id} was successfully deleted.` };
  }
}
```

> [!NOTE]
> Si vous utilisez un ID personnalisé (`Math.random()`), **supprimez `@default(cuid())`** du schema Prisma pour le champ `id`. Sinon, Prisma générera son propre ID et ignorera le vôtre.

---

## 10. Lancer la base de données locale

```bash
# Démarrer une instance locale Prisma Postgres (en arrière-plan)
npx prisma dev --detach

# Vérifier l'état des instances
npx prisma dev ls

# Arrêter une instance
npx prisma dev stop default
```

> [!TIP]
> `prisma dev` démarre un serveur PostgreSQL local éphémère sans avoir besoin de Docker ou d'une installation PostgreSQL manuelle.

---

## 11. Synchroniser le schema avec la DB

```bash
# Méthode rapide (développement) — synchronise le schema sans créer de migration
npx prisma db push

# Méthode avec migrations (recommandée pour la production)
npx prisma migrate dev --name init

# Régénérer le client après modification du schema
npx prisma generate
```

---

## 12. Guide de Debug — Erreurs courantes

### ❌ Erreur P1012 : `url` is no longer supported in schema files

```
error: The datasource property `url` is no longer supported in schema files.
```

**Cause :** En Prisma 7, la propriété `url` dans `datasource` du `schema.prisma` est interdite.

**Solution :** Supprimer `url` du schema et le configurer dans `prisma.config.ts` :
```diff
 datasource db {
   provider = "postgresql"
-  url      = env("DATABASE_URL")
 }
```

---

### ❌ Erreur TS2353 : `datasources` does not exist on type PrismaClientOptions

```
Object literal may only specify known properties,
and 'datasources' does not exist in type 'PrismaClientOptions'
```

**Cause :** L'ancien pattern Prisma 5/6 avec `datasources: { db: { url } }` n'existe plus en Prisma 7.

**Solution :** Utiliser un **adapter** ou **accelerateUrl** :
```typescript
// ✅ Avec adapter (URL TCP directe)
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
super({ adapter });

// ✅ Avec accelerateUrl (URL prisma+postgres://)
super({ accelerateUrl: process.env.DATABASE_URL });
```

---

### ❌ PrismaClientConstructorValidationError : requires "adapter" or "accelerateUrl"

```
Using engine type "client" requires either "adapter" or "accelerateUrl"
to be provided to PrismaClient constructor.
```

**Cause :** `process.env.DATABASE_URL` est `undefined` → dotenv n'est pas chargé.

**Solution :** Ajouter `import 'dotenv/config'` en **première ligne** de `src/main.ts`.

---

### ❌ TypeError: fetch failed — ECONNREFUSED

```
[TypeError: fetch failed] {
  [cause]: AggregateError [ECONNREFUSED]:
    Error: connect ECONNREFUSED 127.0.0.1:51213
```

**Cause :** Le serveur de base de données local n'est pas démarré.

**Solution :**
```bash
npx prisma dev --detach
```

---

### ❌ Error: listen EADDRINUSE: address already in use :::3000

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Cause :** Une instance précédente de l'application tourne encore sur le port 3000.

**Solution :**
```bash
# Tuer le processus qui occupe le port
kill $(lsof -t -i:3000)

# Ou utiliser un autre port
PORT=3001 npm run start:dev
```

---

### ❌ Erreur P2021 : Table does not exist

```
The table `public.Task` does not exist in the current database.
```

**Cause :** Le schema Prisma n'a pas été synchronisé avec la base de données.

**Solution :**
```bash
# Synchroniser le schema
npx prisma db push
```

---

### ❌ Erreur P6000 : HTTP connection string not supported

```
Using an HTTP connection string is not supported with Prisma Client version 7.8.0
by this version of `prisma dev`
```

**Cause :** L'URL `prisma+postgres://` (proxy HTTP) n'est pas compatible avec le driver adapter `PrismaPg`.

**Solution :** Utiliser l'URL **TCP directe** fournie par `prisma dev ls` :
```env
# ❌ Ne pas utiliser avec adapter-pg
DATABASE_URL="prisma+postgres://localhost:51213/?api_key=..."

# ✅ Utiliser l'URL TCP directe
DATABASE_URL="postgres://postgres:postgres@localhost:51214/template1?sslmode=disable"
```

---

## 📁 Récapitulatif de la structure des fichiers

```
project/
├── prisma/
│   ├── schema.prisma          # Définition des modèles
│   └── migrations/            # Fichiers de migration
├── src/
│   ├── main.ts                # Point d'entrée (import dotenv ici)
│   ├── app.module.ts          # Module racine (importe PrismaModule)
│   ├── prisma/
│   │   ├── prisma.service.ts  # Service Prisma (adapter pg)
│   │   └── prisma.module.ts   # Module global Prisma
│   └── tasks/
│       ├── tasks.service.ts   # Service métier (injecte PrismaService)
│       ├── tasks.controller.ts
│       ├── tasks.module.ts
│       ├── dto/
│       │   ├── create-task.dto.ts
│       │   └── update-task.dto.ts
│       └── entities/
│           └── task.entity.ts
├── prisma.config.ts           # Config CLI Prisma (URL pour migrations)
├── .env                       # Variables d'environnement
└── package.json
```

---

## ⚡ Commandes essentielles

| Commande | Description |
|----------|-------------|
| `npx prisma dev --detach` | Démarrer la DB locale en arrière-plan |
| `npx prisma dev ls` | Lister les instances DB |
| `npx prisma generate` | Régénérer le client Prisma |
| `npx prisma db push` | Synchroniser le schema → DB (dev) |
| `npx prisma migrate dev --name <nom>` | Créer une migration |
| `npx prisma studio` | Interface web pour explorer la DB |
| `npm run start:dev` | Lancer l'app NestJS en mode watch |
