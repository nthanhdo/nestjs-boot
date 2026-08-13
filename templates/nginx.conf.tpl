events {
    worker_connections 1024;
}

http {
    upstream app {
        least_conn;
        server app:3000;
        # Docker Compose DNS resolves to all replicas
    }

    server {
        listen 80;

        location / {
            proxy_pass http://app;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Correlation-Id $request_id;

            # Timeouts aligned with nestjs-boot shutdown
            proxy_connect_timeout 5s;
            proxy_read_timeout 60s;
            proxy_send_timeout 60s;
        }

        location /health {
            proxy_pass http://app;
            access_log off;
        }

        location /metrics {
            proxy_pass http://app;
            allow 10.0.0.0/8;
            allow 172.16.0.0/12;
            deny all;
        }
    }
}
