FROM nginx:alpine

# حذف الإعدادات الافتراضية للـ Nginx
RUN rm /etc/nginx/nginx.conf

# نسخ ملف الإعدادات الشامل المخصص بتاعك
COPY default.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]