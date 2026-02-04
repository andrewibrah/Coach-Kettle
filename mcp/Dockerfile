FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Create mount points for docs and codebase
RUN mkdir -p /docs /codebase

# Set environment variables
ENV DOCS_PATH=/docs
ENV CODEBASE_PATH=/codebase
ENV NODE_ENV=production

# Run the MCP server
ENTRYPOINT ["node", "dist/index.js"]
