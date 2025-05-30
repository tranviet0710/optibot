# OptiSigns Article Fetcher

This script fetches articles from the OptiSigns support site and converts them to clean Markdown files.

## Setup

1. Install the required dependencies:
```bash
pip install -r requirements.txt
```

2. Create a `.env` file with your Zendesk credentials:
```
ZENDESK_EMAIL=your-email@example.com
ZENDESK_API_TOKEN=your-api-token
```

To get your Zendesk API token:
1. Go to your Zendesk account settings
2. Navigate to the API section
3. Generate a new API token

## Usage

Run the script:
```bash
python fetch_articles.py
```

The script will:
1. Fetch all articles from the OptiSigns support site
2. Convert each article to clean Markdown format
3. Save them in the `articles` directory with filenames based on the article titles

## Output

Each article will be saved as a Markdown file with:
- Clean, formatted content
- Preserved links and code blocks
- Frontmatter containing metadata (title, ID, creation date, etc.)
- No navigation or advertisement elements 

## Vector Store Upload & Chunking

- Markdown files are split into ~1000 character chunks for optimal retrieval.
- Each chunk is separated by a delimiter (`---`).
- All chunks are uploaded to OpenAI and attached to a Vector Store.
- The script logs the number of files and chunks uploaded.
- You can adjust the chunk size in `upload_to_vectorstore.py` as needed.