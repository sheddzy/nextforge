FROM nginx:alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy all site files
COPY index.html /usr/share/nginx/html/
COPY courses.html /usr/share/nginx/html/
COPY course-detail.html /usr/share/nginx/html/
COPY about.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/

# Write nginx config inline — no external nginx.conf file needed
RUN printf 'server {\n\
    listen 8080;\n\
        server_name _;\n\
            root /usr/share/nginx/html;\n\
                index index.html;\n\
                    location / {\n\
                            try_files $uri $uri.html $uri/ =404;\n\
                                }\n\
                                    location ~* \\.(css|js|png|jpg|svg|ico|woff2)$ {\n\
                                            expires 1y;\n\
                                                    add_header Cache-Control "public, immutable";\n\
                                                        }\n\
                                                            gzip on;\n\
                                                                gzip_types text/css text/html application/javascript;\n\
                                                                }\n' > /etc/nginx/conf.d/default.conf

                                                                EXPOSE 8080

                                                                CMD ["nginx", "-g", "daemon off;"]