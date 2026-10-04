FROM nginx:alpine
# نسخ ملفات الـ Static المبنّية إلى Nginx
COPY  /app/dist /usr/share/nginx/html
# نسخ إعدادات Nginx المخصصة
COPY . /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]