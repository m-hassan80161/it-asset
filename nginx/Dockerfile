FROM nginx:alpine

# نسخ فولدر dist المحلي
COPY ./dist /usr/share/nginx/html

# نسخ ملف إعدادات Nginx المخصص
COPY default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]