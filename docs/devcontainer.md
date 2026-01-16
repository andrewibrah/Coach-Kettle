# Using the Development Container

This project is configured with a **VS Code Development Container**. This ensures that every developer uses the exact same tools and environment, regardless of their local OS (Mac, Windows, Linux).

## Prerequisites

1.  **Docker Desktop**: Install and start Docker Desktop.
2.  **VS Code**: Install Visual Studio Code.
3.  **Dev Containers Extension**: In VS Code, install the "Dev Containers" extension (ms-vscode-remote.remote-containers).

## How to Start

1.  Open this project folder in VS Code.
2.  You should see a pop-up in the bottom right corner: *"Folder contains a Dev Container configuration file. Reopen to develop in a container."*
3.  Click **Reopen in Container**.
    - *Alternatively: Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows), type "Dev Containers: Reopen in Container", and select it.*

4.  VS Code will build the Docker image (this takes a few minutes the first time).
5.  Once the window reloads, you are **inside** the Linux container.

## What's Included?

-   **Node.js**: The correct version for this project.
-   **Expo CLI**: `npx expo start` works out of the box.
-   **Supabase CLI**: The `supabase` command is installed and ready.
-   **Watchman**: Pre-installed for better React Native performance.

## Usage Tips

-   **Running the App**:
    ```bash
    npm install
    npx expo start --tunnel
    ```
    -   **Physical Device**: Scan the QR code with your phone (Expo Go app).
        -   *Note*: The `--tunnel` flag is required because the container network is isolated from your phone's network.
        -   *Troubleshooting*: If you see `ngrok 3004` (rate limited), get a free token from [ngrok dashboard](https://dashboard.ngrok.com), then run `export NGROK_AUTHTOKEN=<token>` before starting.
    -   **Web**: Press `w` to open in browser.
    -   **Android Emulator**: Press `a` (requires configuring Android in the container or connecting a device via USB/ADB).
    -   **iOS Simulator**: Not supported on Linux/Windows containers (requires a Mac).

-   **Supabase**:
    ```bash
    supabase start
    ```
    This spins up the local database inside the container (Docker-in-Docker sidecar).

-   **Formatting**: Prettier is configured to format on save automatically.
