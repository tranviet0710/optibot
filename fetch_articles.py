import os
import aiohttp
import html2text
from bs4 import BeautifulSoup
from dotenv import load_dotenv
import re
import asyncio
from typing import List, Dict, Any
import ssl
import certifi
import json
from datetime import datetime
import pytz

# Load environment variables
load_dotenv()

# Zendesk API configuration
ZENDESK_EMAIL = os.getenv('ZENDESK_EMAIL')
ZENDESK_API_TOKEN = os.getenv('ZENDESK_API_TOKEN')
ZENDESK_SUBDOMAIN = os.getenv('ZENDESK_SUBDOMAIN')

# Create output directory
OUTPUT_DIR = 'articles'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Metadata file
METADATA_FILE = 'article_metadata.json'

def load_metadata():
    """Load article metadata from file."""
    if os.path.exists(METADATA_FILE):
        with open(METADATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_metadata(metadata):
    """Save article metadata to file."""
    with open(METADATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=4)

def clean_slug(title: str) -> str:
    """Convert title to a clean slug."""
    # Convert to lowercase and replace spaces with hyphens
    slug = title.lower()
    # Remove special characters
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    # Replace spaces with hyphens
    slug = re.sub(r'\s+', '-', slug)
    return slug

def clean_html(html_content: str) -> str:
    """Remove navigation, ads, and unwanted elements from HTML."""
    soup = BeautifulSoup(html_content, "html.parser")
    # Remove common navigation and ad elements
    for selector in ["nav", "header", "footer", "aside", "script", "style", ".ads", ".advertisement", "#ads", "#advertisement", ".navbar", ".sidebar", ".footer", ".header"]:
        for tag in soup.select(selector):
            tag.decompose()
    return str(soup)

def convert_to_markdown(html_content: str) -> str:
    """Convert cleaned HTML content to clean Markdown, preserving links, code blocks, and headings."""
    # Clean HTML first
    cleaned_html = clean_html(html_content)

    # Initialize html2text
    h = html2text.HTML2Text()
    h.ignore_links = False
    h.ignore_images = False
    h.body_width = 0  # Don't wrap text
    h.protect_links = True  # Don't mangle links
    h.ignore_emphasis = False
    h.ignore_tables = False
    h.mark_code = True  # Try to preserve code blocks

    # Convert HTML to Markdown
    markdown = h.handle(cleaned_html)

    # Clean up the markdown
    # Remove multiple newlines
    markdown = re.sub(r'\n{3,}', '\n\n', markdown)
    # Remove any remaining HTML tags (should be rare)
    markdown = re.sub(r'<[^>]+>', '', markdown)
    # Ensure fenced code blocks
    markdown = re.sub(r'\n {4}', '\n    ', markdown)  # Indented code to fenced if needed
    # Remove trailing whitespace
    markdown = '\n'.join(line.rstrip() for line in markdown.splitlines())

    return markdown.strip()

async def fetch_articles() -> List[Dict[str, Any]]:
    """Fetch articles from Zendesk API using aiohttp and handle delta."""
    base_url = f'https://{ZENDESK_SUBDOMAIN}/api/v2/help_center/en-us/articles.json'
    headers = {
        'Authorization': f'Basic {ZENDESK_EMAIL}:{ZENDESK_API_TOKEN}',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
    
    articles_to_process = []
    page = 1
    
    # Load existing metadata
    existing_metadata = load_metadata()
    new_metadata = {}
    
    added_count = 0
    updated_count = 0
    skipped_count = 0

    # Create SSL context
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE # Consider removing or making configurable for better security

    # Configure aiohttp client
    connector = aiohttp.TCPConnector(ssl=ssl_context)
    timeout = aiohttp.ClientTimeout(total=60) # Increased timeout

    async with aiohttp.ClientSession(
        connector=connector,
        timeout=timeout,
        headers=headers
    ) as session:
        while True:
            try:
                print(f"Fetching page {page}...")
                async with session.get(f'{base_url}?page={page}') as response:
                    response.raise_for_status()
                    data = await response.json()
                    
                    if not data.get('articles'):
                        print("No articles found in response")
                        break
                    
                    for article in data['articles']:
                        article_id = str(article['id'])
                        updated_at = article['updated_at']

                        new_metadata[article_id] = updated_at

                        if article_id not in existing_metadata:
                            print(f"New article found: {article['title']}")
                            articles_to_process.append(article)
                            added_count += 1
                        elif existing_metadata[article_id] != updated_at:
                            print(f"Article updated: {article['title']}")
                            articles_to_process.append(article)
                            updated_count += 1
                        else:
                            skipped_count += 1
                            print(f"Skipping article: {article['title']}") # Optional: uncomment for verbose logging
                    
                    print(f"Successfully fetched {len(data['articles'])} articles from page {page}")
                    
                    if not data.get('next_page'):
                        print("No more pages available")
                        break
                    
                    page += 1
                    await asyncio.sleep(2)  # Rate limiting
                    
            except aiohttp.ClientError as e:
                print(f"HTTP Error on page {page}: {str(e)}")
                # If it's the first page, raise the error
                if page == 1:
                     raise
                # Otherwise, break and process what we have
                break
            except Exception as e:
                print(f"Unexpected error on page {page}: {str(e)}")
                if page == 1:
                    raise
                break
    
    print(f"\n--- Summary ---")
    print(f"Articles Added: {added_count}")
    print(f"Articles Updated: {updated_count}")
    print(f"Articles Skipped: {skipped_count}")
    print(f"Total articles to process: {len(articles_to_process)}")
    print(f"---------------")
    
    # Save the new metadata for the next run
    save_metadata(new_metadata)
    print(f"Saved updated metadata to {METADATA_FILE}")

    # Get current UTC time
    utc_now = datetime.utcnow()
    # Define the Vietnamese timezone
    vietnam_tz = pytz.timezone('Asia/Ho_Chi_Minh')
    # Convert UTC time to Vietnamese time
    utc = pytz.timezone('UTC')
    vietnam_now = utc.localize(utc_now).astimezone(vietnam_tz)
    # Format the time
    timestamp_str = vietnam_now.strftime('%Y-%m-%d %H:%M:%S')

    # Log summary to file
    log_file_path = 'log.txt'
    with open(log_file_path, 'a', encoding='utf-8') as log_file:
        log_file.write(f"\n--- Run at {timestamp_str} VST ---")
        log_file.write(f"\nArticles Added: {added_count}")
        log_file.write(f"\nArticles Updated: {updated_count}")
        log_file.write(f"\nArticles Skipped: {skipped_count}")
        log_file.write(f"\nTotal articles to process: {len(articles_to_process)}")
        log_file.write(f"\n---------------")
        print(f"\n--- Run at {timestamp_str} VST ---")
        print(f"\nArticles Added: {added_count}")
        print(f"\nArticles Updated: {updated_count}")
        print(f"\nArticles Skipped: {skipped_count}")
        print(f"\nTotal articles to process: {len(articles_to_process)}")
        print(f"\n---------------")

    return articles_to_process

async def process_articles(articles):
    """Process and save articles."""
    if not articles:
        print("No new or updated articles to process.")
        # Clear the articles directory if you only want delta files for upload
        for item in os.listdir(OUTPUT_DIR):
            item_path = os.path.join(OUTPUT_DIR, item)
            if os.path.isfile(item_path):
                os.remove(item_path)
        return

    print(f"Processing {len(articles)} new/updated articles...")

    # Clear the output directory to ensure only delta files are present for upload
    for item in os.listdir(OUTPUT_DIR):
        item_path = os.path.join(OUTPUT_DIR, item)
        if os.path.isfile(item_path):
            os.remove(item_path)
            print(f"Cleared old file: {item_path}")

    for article in articles:
        try:
            title = article['title']
            slug = clean_slug(title)
            content = article['body']
            
            # Convert to markdown
            markdown_content = convert_to_markdown(content)
            
            # Add frontmatter
            frontmatter = f"""---
                        title: {title}
                        id: {article['id']}
                        created_at: {article['created_at']}
                        updated_at: {article['updated_at']}
                        ---

                        """
            full_content = frontmatter + markdown_content
            
            # Save to file
            output_path = os.path.join(OUTPUT_DIR, f"{slug}.md")
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(full_content)
            
            print(f"Saved: {output_path}")
            
        except Exception as e:
            print(f"Error processing article {article.get('id', 'unknown')}: {str(e)}")
            continue

async def main_flow():
    """Main asynchronous flow."""
    try:
        articles_to_process = await fetch_articles()
        await process_articles(articles_to_process)

    except Exception as e:
        print(f"An error occurred during the fetch/process step: {str(e)}")
        # Exit with a non-zero code to indicate failure
        # sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main_flow())