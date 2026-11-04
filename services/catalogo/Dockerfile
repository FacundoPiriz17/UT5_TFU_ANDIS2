FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SERVICE_NAME=catalogo
COPY requirements.txt ./
COPY services/catalogo/requirements.txt services/catalogo/requirements.txt
RUN pip install --no-cache-dir -r services/catalogo/requirements.txt
COPY app/__init__.py app/database.py app/cache.py app/configuration.py app/observability.py app/service_health.py app/
COPY app/aspects/ app/aspects/
COPY security/__init__.py security/oidc.py security/dependencies.py security/
COPY services/__init__.py services/
COPY services/catalogo/ services/catalogo/
COPY contracts/ contracts/
ARG API_VERSION=ut5-v1
ENV API_VERSION=${API_VERSION}
RUN mkdir -p /app/logs
EXPOSE 8000
CMD ["uvicorn", "services.catalogo.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
