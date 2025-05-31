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
- `article_metadata.json`: (Generated at runtime) Stores metadata (like article IDs and `updated_at` timestamps) to track changes between runs.

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
5.  **Schedule:** Configure the desired cron schedule (e.g., `0 0 * * *` for daily at midnight).
6.  **Environment Variables:** Manually add the required variables (`OPENAI_API_KEY`, `ZENDESK_EMAIL`, `ZENDESK_API_TOKEN`, `ZENDESK_SUBDOMAIN`) and their values (consider using Secrets).
7.  **Storage:** Add a **Persistent Volume**. Mount it to the path `/app`. Choose a suitable volume size.
8.  **Logs:** Job logs, including the counts of added, updated, and skipped articles, can be viewed directly in the DigitalOcean App Platform dashboard for each job run.

## Vector Store Upload & Chunking Strategy

-   Markdown files for new/updated articles are split into ~1000 character chunks for optimal retrieval by the OpenAI Assistant.
-   Each chunk is currently separated by a delimiter (`---`) before uploading.
-   These chunks are uploaded to OpenAI and attached to the specified Vector Store (`optisigns-chatbot`).
-   The script logs the total number of files and chunks uploaded in each run.
-   The chunk size (`CHUNK_SIZE`) can be adjusted in `upload_to_vectorstore.py`.