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
    npx expo start
    ```
    This will forward port `8081`. You can scan the QR code with your phone (on the same Wi-Fi) or press `a` for Android emulator / `i` for iOS simulator.

-   **Supabase**:
    ```bash
    supabase start
    ```
    This spins up the local database inside the container (Docker-in-Docker sidecar).

-   **Formatting**: Prettier is configured to format on save automatically.
