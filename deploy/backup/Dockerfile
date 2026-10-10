# Servicio de copias cifradas (perfil "backup" de docker-compose.yml).
FROM alpine:3.24
RUN apk add --no-cache postgresql17-client age tzdata rsync openssh-client
COPY backup.sh loop.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/loop.sh
ENV TZ=Europe/Madrid
CMD ["/usr/local/bin/loop.sh"]
