# Tabinator

This project has been converted from a static Nginx site to a dynamic web application powered by a Node.js backend.

This allows the user interface (UI) to create, update, and delete entries in the `links.yaml` file.

## Architecture

* **Frontend:** The `index.html` file remains the UI. It now uses JavaScript's `fetch` to talk to a local API instead of reading `links.yaml` directly.

* **Backend:** A new `server.js` file (using Node.js and Express) runs a web server. This server is responsible for:

  1. Serving the `index.html` file.

  2. Providing an API for managing the links.

  3. Reading from and writing to the `links.yaml` file on the server.

## API Endpoints

The `server.js` provides the following API:

* `GET /api/data`: Reads `links.yaml`, parses it, and sends the full data as JSON.

* `POST /api/links`: (Add) Receives a new link object in the request body, adds it to `links.yaml`, and saves the file.

* `PUT /api/links`: (Edit) Receives an `originalUrl` and an `updatedLink` object. It finds the link by its original URL and replaces it with the new data, then saves.

* `DELETE /api/links`: (Delete) Receives a `url` in the request body. It finds and removes the link with that URL, then saves.

## How to Run (with Docker)

The easiest way to run this is with the updated `docker-compose.yml`:

```
# This will build the new Docker image and start the server
docker-compose up --build

```

Access the app at `http://localhost:8080`.

## How to Run (with Podman)

1. **Build the Container Image:**
   From the root of the project (where the `Dockerfile` is), run:

   ```
   podman build -t tabinator .
   
   ```

2. **Run the Container:**
   This command runs the image you just built, maps port 8080, and mounts the `./app` directory to persist your `links.yaml` data. The `:Z` flag handles SELinux permissions.

   ```
   podman run -d \
     --name tabinator \
     -p 8080:8080 \
     -v ./app:/usr/src/app/app:Z \
     --restart unless-stopped \
     --security-opt no-new-privileges \
     tabinator
   
   ```

3. **Access:**
   Open `http://localhost:8080` in your browser.

## How to Run (Locally without Containers)

1. **Install Dependencies:** You need [Node.js](https://nodejs.org/) installed.

   ```
   npm install
   
   ```

2. **Run the Server:**

   ```
   npm start
   
   ```

3. **Access:** Open `http://localhost:8080` in your browser.