# Tier 1: Backend API Tier (Node.js Express)
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package definitions first to utilize Docker build layer caching
COPY package*.json ./

# Install production dependencies cleanly based on package-lock.json
RUN npm ci --omit=dev

# Copy application source code into the container
COPY . .

# Ensure the uploads directory exists for file ingestion
RUN mkdir -p uploads

# Document the port the container listens on
EXPOSE 5001

# Set production environment variables
ENV NODE_ENV=production \
    PORT=5001

# Command executed when the container starts
CMD ["node", "server.js"]

