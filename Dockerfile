# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set environment variables to prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set the working directory in the container
WORKDIR /app

# Install any needed system dependencies
# 'build-essential' might be needed for some Python packages, adjust as necessary.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy the requirements file first to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy the rest of the application code into the container's working directory
COPY . .

# Make the persistent data directory if it doesn't exist (for metadata and logs)
# This is where the volume will be mounted by Docker Compose or docker run -v
RUN mkdir -p /app/

# Run main.py when the container launches
CMD ["python", "main.py"] 