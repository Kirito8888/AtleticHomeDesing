# Llaves SSH en cada equipo (antes de desactivar la contraseña)

Manual para entrar al servidor con llave desde varios equipos (Windows y Mac) **antes** de aplicar `harden-server.sh --apply --only ssh`, que desactiva el SSH por contraseña. Si aplicas ese paso con un equipo sin llave instalada, ese equipo pierde el acceso.

Los ejemplos usan `servidor@10.0.0.54`: **cambia el usuario y la IP por los tuyos** en todos los comandos. Si algo sale distinto de lo esperado, para y no pases al siguiente paso.

**Cómo funciona.** Cada equipo tiene una pareja de ficheros. La **privada** (`id_ed25519`) no sale nunca de ese equipo. La **pública** (`id_ed25519.pub`) se copia al servidor, a `~/.ssh/authorized_keys`. Al conectar, el servidor comprueba que el equipo tiene la privada que encaja con una pública conocida. Por eso **cada equipo necesita su propia pareja**; no copies una privada de un equipo a otro. Tener una llave por equipo también sirve de respaldo: si pierdes uno, los demás siguen entrando.

## Parte 1: Windows (repetir en cada Windows)
1. **Abre PowerShell** (tecla Windows, escribe `powershell`, Intro). Para pegar, clic derecho.
2. **Comprueba `ssh`:** `ssh -V`. Esperado: una línea tipo `OpenSSH_for_Windows_9...`. Si no reconoce el comando: Configuración → Aplicaciones → Características opcionales → Agregar una característica → **Cliente OpenSSH**; abre PowerShell de nuevo.
3. **¿Ya tienes llave?** `dir $env:USERPROFILE\.ssh`. Si aparecen `id_ed25519` e `id_ed25519.pub`, salta al paso 5.
4. **Crea la llave** (en cada Windows cambia el nombre: `david-portatil`, `david-windows-2`…):
   ```powershell
   ssh-keygen -t ed25519 -C "david-portatil"
   ```
   Ruta: **Intro**. Si pregunta *Overwrite (y/n)?* ya tenías llave: responde **n** y vuelve al paso 3. Frase de paso: opcional (más segura si la pones, pero te la pide en cada conexión).
5. **Comprueba la pública:** `type $env:USERPROFILE\.ssh\id_ed25519.pub`. Debe salir **una línea** que empieza por `ssh-ed25519 AAAA...` y acaba con tu nombre. Nunca compartas la otra (sin `.pub`).
6. **Súbela al servidor** (una sola línea):
   ```powershell
   type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh servidor@10.0.0.54 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && tr -d '\r' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
   ```
   La primera vez pregunta *continue connecting (yes/no)?*: `yes`. Pide la **contraseña del servidor** (no se ve al teclear). Si todo va bien, no imprime nada. Añade tu pública al final de `authorized_keys` con los permisos que exige sshd; `tr -d '\r'` quita los saltos de línea de Windows.
7. **Pruébala:** `ssh -o PasswordAuthentication=no servidor@10.0.0.54`. Esperado: entras **sin** que pida la contraseña del servidor (la frase de paso de tu llave sí puede pedirla). `exit` para salir. Si dice `Permission denied (publickey,password)`: ver «Si falla».

## Parte 2: Mac
1. **Abre Terminal** (Cmd+Espacio, `Terminal`).
2. **¿Ya tienes llave?** `ls ~/.ssh`. Si ves `id_ed25519` e `id_ed25519.pub`, salta al paso 4.
3. **Créala:** `ssh-keygen -t ed25519 -C "david-mac"` (mismas respuestas que en Windows).
4. **Súbela:** `ssh-copy-id servidor@10.0.0.54`. Responde `yes` y la contraseña del servidor. Esperado: `Number of key(s) added: 1`. Si no existe el comando:
   ```sh
   cat ~/.ssh/id_ed25519.pub | ssh servidor@10.0.0.54 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
   ```
5. **Pruébala:** `ssh -o PasswordAuthentication=no servidor@10.0.0.54`. Esperado: entras sin la contraseña del servidor.
6. Opcional, para no teclear la frase de paso: `ssh-add --apple-use-keychain ~/.ssh/id_ed25519`.

## Parte 3: comprobar que están todas las llaves
Desde un equipo con llave, en el servidor:
```sh
awk '{print $1, $NF}' ~/.ssh/authorized_keys
```
Debe salir **una línea por equipo** (`ssh-ed25519 david-portatil`, `ssh-ed25519 david-windows-2`, `ssh-ed25519 david-mac`). Si falta una, repite la subida desde ese equipo. **No pases a la Parte 4 hasta que estén todas y cada equipo haya pasado su prueba del paso 7 (Windows) o 5 (Mac).**

## Parte 4: aplicar el endurecimiento
Usa **dos ventanas**: la **1** se queda conectada al servidor y no se cierra hasta el paso 8; la **2** es para probar.
1. **Entra** (ventana 1): `ssh servidor@10.0.0.54`.
2. **Localiza el repo:** `find ~ /opt /srv -name harden-server.sh 2>/dev/null`. Si no sale nada, para y averigua cómo se desplegó Atlenza.
3. **Actualiza:** entra en la carpeta del repo (la ruta anterior sin `/scripts/ops/harden-server.sh`) y `git pull origin main`. Si se queja de cambios locales, no uses `--force`.
4. **Foto de puertos antes:** `sudo ss -tulpn > ~/puertos-antes.txt`.
5. **Simulación (no cambia nada):** `sudo bash scripts/ops/harden-server.sh --user servidor`. Esperado: `bloqueos detectados: 0` y, en SSH, tantas claves como equipos. Los puertos 81, 9000 y 9443 saldrán `EXPUESTO` (se cierran en otra sesión). Con cualquier `BLOQUEO`, para.
6. **Parches:** `sudo bash scripts/ops/harden-server.sh --apply --only updates` (escribe `SI`). Comprueba `systemctl list-timers 'apt-daily*'` y `sudo unattended-upgrade --dry-run`.
7. **Desactivar la contraseña** (solo con todas las llaves probadas): `sudo bash scripts/ops/harden-server.sh --apply --only ssh --user servidor` (escribe `SI`). Esperado: `sshd -t y sshd -T: contraseña desactivada` y `sshd recargado`.
8. **Verifica desde la ventana 2**, sin cerrar la 1:
   - Con llave entra: `ssh servidor@10.0.0.54`.
   - Con contraseña falla: `ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password servidor@10.0.0.54` → `Permission denied (publickey)`.
   - Repite la prueba con llave desde **cada uno de los demás equipos**. Solo cuando todos entren, cierra la ventana 1.

Los paneles (81, 9000, 9443) se cierran en otra sesión; ver [servidor-hardening.md](servidor-hardening.md).

## Si falla
- **La llave no entra** (`Permission denied (publickey,password)`): entra con contraseña (aún vale) y mira `ls -ld ~ ~/.ssh ~/.ssh/authorized_keys`. Esperado: `~/.ssh` en `drwx------`, `authorized_keys` en `-rw-------` y `~` sin escritura para grupo ni otros (`chmod go-w ~`); sshd ignora las llaves si no se cumple. Más detalle: `ssh -v -o PasswordAuthentication=no servidor@10.0.0.54` (últimas 20 líneas).
- **Algo falla tras el paso 7**, desde la ventana 1 abierta: `sudo rm /etc/ssh/sshd_config.d/99-hardening.conf && sudo sshd -t && sudo systemctl reload ssh`. Sin sesión abierta: consola del proveedor o teclado físico, mismo comando.
- **Copia de seguridad:** guarda una copia de cada `id_ed25519` (sin `.pub`) fuera del repo, en un gestor de contraseñas o un USB cifrado.
