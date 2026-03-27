# Postgenius Pro - Conceptual Backend

This directory contains a conceptual Node.js backend server for handling article storage, as requested.

**Note:** This server is for demonstration purposes and is **not** connected to the main client-side application. The application architecture is currently serverless.

## Setup

1.  Navigate to the `backend` directory:
    ```bash
    cd backend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

## Running the Server

To run the server in development mode (using `ts-node`):

```bash
npm start
```

This will start the server and watch for changes.

To build and run the production version:

```bash
npm run build
npm run serve
```

The server will start on `http://localhost:3000`.

## API Endpoint

-   **POST** `/api/save-article`
    -   Saves an article to the local filesystem inside `./public_html/postgenius_internal_data/`.
    -   **Body (JSON):**
        ```json
        {
          "articleData": { "...": "..." },
          "articleType": "review"
        }
        ```

## Deployment on Hostinger (or similar shared hosting)

To deploy this conceptual Node.js server on a hosting provider like Hostinger that supports Node.js, follow these general steps.

### 1. Build the Project

First, compile the TypeScript code into JavaScript:
```bash
npm run build
```
This will create a `dist` folder containing the compiled `server.js` file.

### 2. Upload Files to Server

Using Hostinger's File Manager or an FTP client, upload the following to your server, typically into a dedicated subdirectory (e.g., `my-api`):
- The entire `dist` folder.
- The `node_modules` folder.
- The `package.json` file.

**Note:** Uploading `node_modules` is straightforward but not always optimal. A better approach is to upload only `package.json` and `package-lock.json`, then run `npm install` via an SSH terminal on your server if your hosting plan allows it.

### 3. Configure the Node.js App in Hostinger

1.  Go to your Hostinger hPanel.
2.  Navigate to **Advanced** > **Node.js**.
3.  Click **Create Application**.
4.  Set the **Application root** to the directory where you uploaded your files (e.g., `my-api`).
5.  Set the **Application startup file** to `dist/server.js`.
6.  Click **Create**. The panel will install dependencies and start your application.

### 4. Set the File Path Securely

The current code saves files to `public_html/postgenius_internal_data/`.

- **Security:** Ensure this directory is configured correctly. If you want the files to be private, this directory should be located **outside** of `public_html` to prevent direct web access. You would need to adjust the `STORAGE_PATH` in `src/server.ts` to use an absolute path provided by your hosting environment, for example: `/home/your_user/postgenius_internal_data`.
- **Permissions:** The Node.js application process needs write permissions for the target directory. Set the directory permissions to `755` using the File Manager or `chmod 755 postgenius_internal_data` in an SSH terminal.

After making any changes, remember to stop and restart the Node.js application from your Hostinger control panel.
