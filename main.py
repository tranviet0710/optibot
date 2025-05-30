import subprocess
import sys

# Step 1: Scrape articles and save as Markdown files
print("[1/2] Fetching articles from support site...")
result = subprocess.run([sys.executable, "fetch_articles.py"])
if result.returncode != 0:
    print("Error: fetch_articles.py failed.")
    sys.exit(result.returncode)

# Step 2: Upload Markdown files to OpenAI Vector Store
print("[2/2] Uploading articles to OpenAI Vector Store...")
result = subprocess.run([sys.executable, "upload_to_vectorstore.py"])
if result.returncode != 0:
    print("Error: upload_to_vectorstore.py failed.")
    sys.exit(result.returncode)

print("All done!") 