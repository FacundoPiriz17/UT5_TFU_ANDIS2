FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SERVICE_NAME=comercial
COPY requirements.txt ./
COPY services/comercial/requirements.txt services/comercial/requirements.txt
RUN pip install --no-cache-dir -r services/comercial/requirements.txt
COPY app/__init__.py app/database.py app/cache.py app/configuration.py app/observability.py app/service_health.py app/
COPY app/aspects/ app/aspects/
COPY app/strategies/ app/strategies/
COPY app/routers/__init__.py app/routers/audit.py app/routers/auth.py app/routers/configuration.py app/routers/
COPY security/__init__.py security/oidc.py security/dependencies.py security/
COPY services/__init__.py services/
COPY services/comercial/ services/comercial/
COPY contracts/ contracts/
ARG API_VERSION=ut5-v1
ENV API_VERSION=${API_VERSION}
RUN mkdir -p /app/logs
EXPOSE 8000
CMD ["uvicorn", "services.comercial.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
