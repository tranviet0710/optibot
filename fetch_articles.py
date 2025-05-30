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

# Load environment variables
load_dotenv()

# Zendesk API configuration
ZENDESK_EMAIL = os.getenv('ZENDESK_EMAIL')
ZENDESK_API_TOKEN = os.getenv('ZENDESK_API_TOKEN')
ZENDESK_SUBDOMAIN = os.getenv('ZENDESK_SUBDOMAIN')

# Create output directory
OUTPUT_DIR = 'articles'
os.makedirs(OUTPUT_DIR, exist_ok=True)

def clean_slug(title: str) -> str:
    """Convert title to a clean slug."""
    # Convert to lowercase and replace spaces with hyphens
    slug = title.lower()
    # Remove special characters
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    # Replace spaces with hyphens
    slug = re.sub(r'\s+', '-', slug)
    return slug

async def fetch_articles() -> List[Dict[str, Any]]:
    """Fetch articles from Zendesk API using aiohttp."""
    base_url = f'https://{ZENDESK_SUBDOMAIN}/api/v2/help_center/en-us/articles.json'
    headers = {
        'Authorization': f'Basic {ZENDESK_EMAIL}:{ZENDESK_API_TOKEN}',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
    
    articles = []
    page = 1
    
    # Create SSL context
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    
    # Configure aiohttp client
    connector = aiohttp.TCPConnector(ssl=ssl_context)
    timeout = aiohttp.ClientTimeout(total=30)
    
    async with aiohttp.ClientSession(
        connector=connector,
        timeout=timeout,
        headers=headers
    ) as session:
        while True:
            try:
                if page > 2:
                    break
                    
                print(f"Fetching page {page}...")
                async with session.get(f'{base_url}?page={page}') as response:
                    response.raise_for_status()
                    data = await response.json()
                    
                    if not data.get('articles'):
                        print("No articles found in response")
                        break
                        
                    articles.extend(data['articles'])
                    print(f"Successfully fetched {len(data['articles'])} articles from page {page}")
                    
                    if not data.get('next_page'):
                        print("No more pages available")
                        break
                        
                    page += 1
                    await asyncio.sleep(2)  # Rate limiting
                    
            except aiohttp.ClientError as e:
                print(f"HTTP Error on page {page}: {str(e)}")
                if page > 1:
                    break
                raise
            except Exception as e:
                print(f"Unexpected error on page {page}: {str(e)}")
                if page > 1:
                    break
                raise
    
    return articles

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

async def process_articles():
    """Process and save articles."""
    try:
        articles = await fetch_articles()
        if not articles:
            print("No articles were fetched. Please check your credentials and connection.")
            return
            
        print(f"Found {len(articles)} articles")
        
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
            
    except Exception as e:
        print(f"Error processing articles: {str(e)}")
        raise

if __name__ == "__main__":
    asyncio.run(process_articles()) 