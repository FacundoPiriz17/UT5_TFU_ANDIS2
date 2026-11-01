FROM nginx:1.27-alpine
RUN apk add --no-cache python3
COPY default.conf /etc/nginx/nginx.conf
COPY static/ /var/www/static/
COPY control.py /opt/gateway/control.py
EXPOSE 80
ENTRYPOINT ["python3", "/opt/gateway/control.py"]
