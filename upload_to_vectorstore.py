import os
import requests
from tqdm import tqdm
from dotenv import load_dotenv

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ARTICLES_DIR = "articles"
CHUNK_SIZE = 1000  # characters per chunk

BASE_URL = "https://api.openai.com/v1"

def chunk_markdown(text, chunk_size=CHUNK_SIZE):
    """Split text into chunks of up to chunk_size characters."""
    chunks = []
    current = ""
    for line in text.splitlines(keepends=True):
        if len(current) + len(line) > chunk_size:
            chunks.append(current)
            current = ""
        current += line
    if current:
        chunks.append(current)
    return chunks

def upload_file(filepath):
    url = f"{BASE_URL}/files"
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}
    with open(filepath, "rb") as f:
        files = {"file": (os.path.basename(filepath), f)}
        data = {"purpose": "assistants"}
        response = requests.post(url, headers=headers, files=files, data=data)
        print(response.json())
    response.raise_for_status()
    return response.json()["id"]

def create_vector_store(name):
    url = f"{BASE_URL}/vector_stores"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {"name": name}
    response = requests.post(url, headers=headers, json=data)
    response.raise_for_status()
    return response.json()["id"]

def attach_file_to_vector_store(vector_store_id, file_id):
    url = f"{BASE_URL}/vector_stores/{vector_store_id}/files"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {"file_id": file_id}
    response = requests.post(url, headers=headers, json=data)
    response.raise_for_status()
    return response.json()

def main():
    vector_store_name = "optisigns-chatbot"
    vector_store_id = create_vector_store(vector_store_name)
    print(f"Created Vector Store: {vector_store_id}")

    file_count = 0
    chunk_count = 0
    for filename in tqdm(os.listdir(ARTICLES_DIR)):
        if not filename.endswith(".md"):
            continue
        filepath = os.path.join(ARTICLES_DIR, filename)
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        chunks = chunk_markdown(content)
        chunk_count += len(chunks)
        chunk_file = f"{filepath}.chunked.md"
        with open(chunk_file, "w", encoding="utf-8") as cf:
            for chunk in chunks:
                cf.write(chunk + "\n---\n")
        file_id = upload_file(chunk_file)
        attach_file_to_vector_store(vector_store_id, file_id)
        os.remove(chunk_file)
        file_count += 1

    print(f"Uploaded {file_count} files and {chunk_count} chunks to Vector Store {vector_store_id}")

if __name__ == "__main__":
    main()