FROM node:20-bookworm-slim

# Install required dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    ffmpeg \
    ca-certificates \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Ensure bin directory exists and download yt-dlp binary
# Also fix permissions on the app directory so the node user can write cookies/etc
RUN mkdir -p bin && \
    wget -qO bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp && \
    chmod a+rx bin/yt-dlp && \
    chown -R node:node /usr/src/app

# Run as non-root user (node is created by the node base image with UID 1000)
USER node

EXPOSE 3000

CMD ["node", "server.js"]
