FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8080

CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 300 app:app


# To deploy the container, from src/backend dir, do:
# gcloud run deploy webamp-backend \
#   --source . \
#   --region us-central1 \
#   --allow-unauthenticated \
#   --memory 2Gi \
#   --timeout 300 \
#   --max-instances 10