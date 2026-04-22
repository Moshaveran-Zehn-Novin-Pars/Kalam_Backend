# 🥬 Kalam Backend

> Backend API for **Kalam** — a B2B wholesale marketplace for fruits and vegetables in Iran.

## 📋 About

Kalam connects farmers, supermarkets, restaurants, hotels, and logistics providers in a single commission-based marketplace platform.

## 🛠 Tech Stack

- **Framework:** NestJS 11 (TypeScript)
- **Database:** PostgreSQL 16 + Prisma ORM
- **Cache & Queue:** Redis 7 + BullMQ
- **Storage:** MinIO (dev) / S3-compatible (prod)
- **Package Manager:** pnpm
- **Containerization:** Docker + Docker Compose

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ (LTS)
- pnpm 8+
- Docker Desktop
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/Moshaveran-Zehn-Novin-Pars/Kalam_Backend.git
cd Kalam_Backend

# Install dependencies
pnpm install

# Start the development server
pnpm start:dev
```

The API will be available at `http://localhost:3000`.

## 📂 Project Structure

src/
├── config/          # Environment and app configuration
├── common/          # Shared decorators, guards, filters, pipes
├── infrastructure/  # External integrations (DB, Redis, SMS, Payment)
└── modules/         # Business modules (auth, users, products, orders, ...)

## 🌿 Git Workflow

- `main` → Production
- `develop` → Staging / Integration
- `feature/KLM-<ticket>-<desc>` → New features
- `fix/KLM-<ticket>-<desc>` → Bug fixes
- `hotfix/KLM-<ticket>-<desc>` → Production hotfixes

Commits follow [Conventional Commits](https://www.conventionalcommits.org/).

## 📄 License

Proprietary — Moshaveran Zehn Novin Pars. All rights reserved.

---

**Status:** 🚧 Under active development (Sprint 1 — Setup & Foundation)