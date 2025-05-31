# OptiSigns Article Scraper & Vector Store Uploader

This project fetches articles from the OptiSigns support site, converts them to Markdown, detects new/updated articles, and uploads the delta to an OpenAI Vector Store.

## Table of Contents

- [Project Overview](#project-overview)
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Running with Docker](#running-with-docker)
- [Running with Docker Compose](#running-with-docker-compose)
- [Scheduled Job on DigitalOcean App Platform](#scheduled-job-on-digitalocean-app-platform)
- [Vector Store Upload & Chunking Strategy](#vector-store-upload--chunking-strategy)

## Project Overview

The project consists of the following main components:
- `fetch_articles.py`: Scrapes articles from the Zendesk support site, handles pagination, detects new/updated articles based on `updated_at` timestamps using `article_metadata.json`, and saves the delta as Markdown files in the `articles/` directory.
- `upload_to_vectorstore.py`: Reads the Markdown files from the `articles/` directory, chunks them, uploads them to OpenAI as files, creates a Vector Store (if it doesn't exist), and attaches the uploaded files to the Vector Store.
- `main.py`: A wrapper script that runs `fetch_articles.py` followed by `upload_to_vectorstore.py`.
- `Dockerfile`: Defines the Docker image for the project.
- `docker-compose.yml`: Helps in building and running the Docker container easily.
- `requirements.txt`: Lists Python dependencies.
- `.env.example`: An example file for required environment variables.
- `article_metadata.json`: (Generated and updated at runtime) Stores metadata (like article IDs and `updated_at` timestamps) to track changes between runs, enabling delta processing. This file requires persistent storage.

## Delta Detection and Processing Flow

This project is designed to run periodically and upload only new or updated articles to your OpenAI Vector Store. The process works as follows:

1.  **Load Existing Metadata:** When `fetch_articles.py` starts, it attempts to load the `article_metadata.json` file from the project's root directory (`/app` in the Docker container). This file contains the IDs and `updated_at` timestamps of all articles found in the previous successful run. If the file doesn't exist (first run), an empty state is assumed.

2.  **Fetch All Articles:** The script fetches the current list of *all* articles from the Zendesk API.

3.  **Identify Delta:** It iterates through the fetched articles and compares each article's ID and `updated_at` timestamp against the loaded metadata:
    *   If an article's ID is **not** in the existing metadata, it's marked as **new**.
    *   If an article's ID is in the existing metadata, but its `updated_at` timestamp is **different**, it's marked as **updated**.
    *   If an article's ID is in the existing metadata and the `updated_at` timestamp is the same, it's marked as **skipped**.

4.  **Clear Output Directory:** Before saving any new files, the `articles/` directory is completely cleared. This is essential to ensure that the `articles/` directory contains *only* the content from the current run's delta.

5.  **Save Delta Articles:** Only the articles marked as **new** or **updated** are then saved as Markdown files in the now-empty `articles/` directory.

6.  **Save New Metadata:** The script generates new metadata containing the IDs and *current* `updated_at` timestamps for *all* articles fetched in this run (including those that were skipped). This new metadata overwrites the old `article_metadata.json` file, preparing for the next run.

7.  **Upload Delta to Vector Store:** The `main.py` script then calls `upload_to_vectorstore.py`. This script simply reads *all* files currently present in the `articles/` directory. Since the previous step ensured this directory contains only the delta, the uploader effectively processes and uploads only the new/updated content to the OpenAI Vector Store.

8.  **Logging:** The script logs the counts of articles that were added, updated, and skipped during the delta identification phase.

**Persistent storage for `article_metadata.json` is critical** for this delta logic to function correctly across multiple runs. This is achieved using Docker volumes or DigitalOcean App Platform Persistent Volumes mounted to `/app`.

## Setup

1.  **Clone the repository:**

    ```bash
    git clone <repository_url>
    cd <repository_directory>
    ```

2.  **Install dependencies (if running locally without Docker):**

    ```bash
    pip install -r requirements.txt
    ```

## Environment Variables

This project requires the following environment variables to be set:

-   `OPENAI_API_KEY`: Your OpenAI API key.
-   `ZENDESK_EMAIL`: The email address for your Zendesk account (used for basic authentication).
-   `ZENDESK_API_TOKEN`: Your Zendesk API token.
-   `ZENDESK_SUBDOMAIN`: The subdomain of your Zendesk help center (e.g., `optisigns`).

Create a `.env` file in the project root based on `.env.example` and provide your credentials:

```ini
OPENAI_API_KEY=sk-...your-key...
ZENDESK_EMAIL=your-email@example.com
ZENDESK_API_TOKEN=your-api-token
ZENDESK_SUBDOMAIN=your-subdomain
```

**Important:** Ensure your `.env` file is not committed to public repositories.

## Running with Docker

The recommended way to run this project is using Docker to ensure a consistent environment.

1.  **Build the Docker image:**

    ```bash
    docker build -t optisigns-bot .
    ```

2.  **Create a Docker Volume for Persistent Storage:**

    ```bash
    docker volume create optisigns-metadata-volume
    ```
    *(You only need to do this once)*.

3.  **Run the container, mounting the persistent volume and passing environment variables:**

    ```bash
    docker run \
        -e OPENAI_API_KEY=$OPENAI_API_KEY \
        -e ZENDESK_EMAIL=$ZENDESK_EMAIL \
        -e ZENDESK_API_TOKEN=$ZENDESK_API_TOKEN \
        -e ZENDESK_SUBDOMAIN=$ZENDESK_SUBDOMAIN \
        -v optisigns-metadata-volume:/app \
        optisigns-bot
    ```
    *(Replace `$OPENAI_API_KEY`, etc., with your actual keys/values, or use an `--env-file` as shown below)*.

    Alternatively, using your `.env` file:

    ```bash
    docker run --env-file .env -v optisigns-metadata-volume:/app optisigns-bot
    ```

    The `-v optisigns-metadata-volume:/app` part ensures that the `article_metadata.json` and `articles/` directories within the container persist between runs, allowing the delta logic to work.

## Running with Docker Compose

Docker Compose simplifies building and running the container, including managing the persistent storage.

1.  **Ensure your `.env` file is present with the required environment variables.**

2.  **Run Docker Compose:**

    ```bash
    docker-compose up --build
    # or with newer Docker: docker compose up --build
    ```

    This will build the image (if necessary), create/use the `optisigns-metadata-volume` (defined implicitly if not explicitly in docker-compose), and run the `optisigns-bot-container`.

## Scheduled Job on DigitalOcean App Platform

To run this workflow automatically on a schedule (e.g., daily) on DigitalOcean App Platform, configure a **Job component**:

1.  **Source:** Link to your GitHub repository.
2.  **Type:** Select **Job**.
3.  **Build Method:** Dockerfile (App Platform will detect and use your `Dockerfile`).
4.  **Command:** Leave as default (`python main.py`) unless you have a specific reason to change it.
5.  **Schedule:** Configure the desired cron schedule (e.g., `0 0 * * *` for daily at midnight UTC). This is configured in the App Platform UI or your `app.yaml` spec file, not in the Dockerfile or docker-compose.
6.  **Environment Variables:** Manually add the required variables (`OPENAI_API_KEY`, `ZENDESK_EMAIL`, `ZENDESK_API_TOKEN`, `ZENDESK_SUBDOMAIN`) and their values (consider using Secrets).
7.  **Storage:** Add a **Persistent Volume**. Mount it to the path `/app`. Choose a suitable volume size. This will persist the `article_metadata.json` file and the `logs/` directory.
8.  **Logs:** Job logs are saved to timestamped `.log` files in the `logs/` directory within the container's mounted persistent storage (`/app/logs/`). You can also view the standard output and errors for each job run directly in the DigitalOcean App Platform dashboard.

## Vector Store Upload & Chunking Strategy

-   Markdown files for new/updated articles are split into ~1000 character chunks for optimal retrieval by the OpenAI Assistant.
-   Each chunk is currently separated by a delimiter (`---`) before uploading.
-   These chunks are uploaded to OpenAI and attached to the specified Vector Store (`optisigns-chatbot`).
-   The script logs the total number of files and chunks uploaded in each run.
-   The chunk size (`CHUNK_SIZE`) can be adjusted in `upload_to_vectorstore.py`.