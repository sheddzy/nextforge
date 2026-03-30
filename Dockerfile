# ── Stage: Serve static files with Nginx ──────────────────────────
FROM nginx:alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy all site files into nginx html directory
COPY index.html /usr/share/nginx/html/
COPY courses.html /usr/share/nginx/html/
COPY course-detail.html /usr/share/nginx/html/
COPY about.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Northflank expects port 8080 by default
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]