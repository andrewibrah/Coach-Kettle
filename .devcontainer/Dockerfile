FROM mcr.microsoft.com/devcontainers/javascript-node:1-20-bullseye

# Install Watchman (helpful for React Native / Expo)
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends watchman \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Install global Expo CLI & EAS CLI
RUN npm install -g eas-cli expo-cli @anthropic-ai/claude-code

# Install Supabase CLI
# Using brew is often easiest, but on Linux (container), we can use the script.
# Alternatively, Supabase provides a direct Linux install script.
RUN curl -L https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar -xz -C /usr/local/bin \
    && mv /usr/local/bin/supabase /usr/local/bin/supabase-cli \
    && ln -s /usr/local/bin/supabase-cli /usr/local/bin/supabase

# Install Deno (required for Supabase Edge Functions)
RUN curl -fsSL https://deno.land/install.sh | sh \
    && echo 'export DENO_INSTALL="/root/.deno"' >> /etc/bash.bashrc \
    && echo 'export PATH="$DENO_INSTALL/bin:$PATH"' >> /etc/bash.bashrc \
    && ln -s /root/.deno/bin/deno /usr/local/bin/deno
