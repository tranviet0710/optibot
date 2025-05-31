import os
import requests
from tqdm import tqdm
from dotenv import load_dotenv

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ARTICLES_DIR = "articles"
CHUNK_SIZE = 1000  # characters per chunk
VECTOR_STORE_NAME = "optisigns-chatbot"

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
        # print(response.json()) # Uncomment for debugging upload response
    response.raise_for_status()
    return response.json()["id"]

def list_vector_stores():
    """Lists existing vector stores."""
    url = f"{BASE_URL}/vector_stores"
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}"}
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()

def find_vector_store_by_name(name):
    """Finds a vector store by name, returns its ID or None if not found."""
    try:
        response_data = list_vector_stores()
        for store in response_data.get("data", []):
            if store.get("name") == name:
                print(f"Found existing Vector Store: {store.get('id')}")
                return store.get("id")
        print(f"Vector Store '{name}' not found.")
        return None
    except requests.exceptions.RequestException as e:
        print(f"Error listing vector stores: {e}")
        # Depending on desired behavior, you might re-raise or return None
        return None

def create_vector_store(name):
    """Creates a new vector store."""
    url = f"{BASE_URL}/vector_stores"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {"name": name}
    response = requests.post(url, headers=headers, json=data)
    response.raise_for_status()
    store_id = response.json()["id"]
    print(f"Created new Vector Store: {store_id}")
    return store_id

def attach_file_to_vector_store(vector_store_id, file_id):
    """Attaches a file to a vector store."""
    url = f"{BASE_URL}/vector_stores/{vector_store_id}/files"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {"file_id": file_id}
    response = requests.post(url, headers=headers, json=data)
    response.raise_for_status()
    # print(response.json()) # Uncomment for debugging attach response
    return response.json()

def main():
    vector_store_id = find_vector_store_by_name(VECTOR_STORE_NAME)
    if not vector_store_id:
        vector_store_id = create_vector_store(VECTOR_STORE_NAME)

    if not vector_store_id:
        print("Could not find or create a Vector Store. Exiting.")
        return # Exit if we couldn't get a vector store ID

    file_count = 0
    chunk_count = 0
    # print(os.listdir(ARTICLES_DIR)) # Uncomment to see files in articles dir
    delta_files = [f for f in os.listdir(ARTICLES_DIR) if f.endswith(".md") or f.endswith(".txt")]

    if not delta_files:
        print("No new or updated articles (Markdown/text files) found in the articles directory to upload.")
        return # Exit if no files to upload

    print(f"Processing {len(delta_files)} new/updated article files for upload...")

    for filename in tqdm(delta_files):
        filepath = os.path.join(ARTICLES_DIR, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            chunks = chunk_markdown(content)
            chunk_count += len(chunks)
            # Create a temporary file for the chunked content
            chunk_file_path = f"{filepath}.chunked.txt" # Use .txt extension
            with open(chunk_file_path, "w", encoding="utf-8") as cf:
                for chunk in chunks:
                    cf.write(chunk + "\n---\n")

            file_id = upload_file(chunk_file_path)
            attach_file_to_vector_store(vector_store_id, file_id)
            os.remove(chunk_file_path) # Clean up the temporary chunk file
            file_count += 1
            print(f"Successfully uploaded and attached {filename}")

        except Exception as e:
            print(f"Error processing file {filename}: {e}")
            # Decide whether to continue or break on error
            continue # Continue with the next file on error

    print(f"Uploaded {file_count} delta files containing {chunk_count} chunks to Vector Store {vector_store_id}")

if __name__ == "__main__":
    main()