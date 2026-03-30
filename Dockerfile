# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm ci --only=production

# Stage 2: Runtime
FROM node:18-alpine AS runtime

WORKDIR /app

# Créer un utilisateur non-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copier les dépendances installées
COPY --from=builder /app/node_modules ./node_modules

# Copier le code source
COPY --chown=nodejs:nodejs . .

# Exposer le port
EXPOSE 3000

# Basculer vers l'utilisateur non-root
USER nodejs

# Commande de démarrage
CMD ["npm", "start"]
