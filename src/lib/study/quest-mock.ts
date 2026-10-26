// Modo Juego · banco de preguntas MOCK (estático) para jugar el bucle completo antes de la IA.
// Copiado de ASO_Quest.html (niveles L1, L2, L3 y L13) con sus variantes válidas extra. Los ids son
// los del original (`L1:t0`, `L1:p3`…) y son lo que se guarda en `fails`.
import type { Accept, Practice, Theory } from "./quest-engine";

export interface MockLevel {
  id: string;
  icon: string;
  title: string;
  theory: Theory[];
  practice: Practice[];
}
export interface QuestItem {
  id: string;
  lid: string;
  type: "t" | "p";
  /** Teoría: la entrada del banco. */
  t?: Theory;
  /** Práctica: la entrada del banco. */
  p?: Practice;
}

const T =
  (start: string, parts: RegExp[], end?: RegExp) =>
  (s: string) =>
    s.startsWith(start + " ") && parts.every((p) => p.test(s)) && (!end || end.test(s));

const LEVELS: (MockLevel & { world?: string; boss?: boolean })[] = [
{ id:'L1', icon:'⌨️', title:'Órdenes de Linux',
 theory:[
 ['¿Con qué símbolo termina el prompt cuando eres root?', ['#','$','>','%'], 'Usuario normal: $ · root: #.'],
 ['¿Dónde se listan los shells disponibles en el sistema?', ['/etc/shells','/etc/passwd','/bin/shells','/etc/bash.bashrc'], '/etc/shells contiene los intérpretes válidos; BASH es el de Ubuntu por defecto.'],
 ['¿Qué hace el operador >> ?', ['Añade la salida al final del fichero','Sobrescribe el fichero','Redirige solo los errores','Envía la salida a otro comando'], '> sobrescribe, >> añade, 2> errores, | tubería.'],
 ['¿Qué número identifica a la salida estándar de errores?', ['2','1','0','3'], '0 = stdin (teclado), 1 = stdout (monitor), 2 = stderr.'],
 ['Un enlace DURO…', ['Comparte el mismo inodo que el original','Tiene un inodo distinto','Puede apuntar a un directorio','Funciona entre sistemas de ficheros distintos'], 'Duro: mismo inodo, solo ficheros, mismo FS. Los datos se borran al eliminar el último enlace.'],
 ['Si borras el fichero original de un enlace SIMBÓLICO…', ['El enlace queda roto','El enlace conserva los datos','El enlace se borra solo','Se convierte en enlace duro'], 'El simbólico apunta a un nombre; sin el original no hay datos. En ls -l aparece con "l".'],
 ['¿Qué condición exige rmdir?', ['Que el directorio esté vacío','Que lo ejecute root','Que se use la opción -R','Que no tenga ficheros ocultos solo'], 'rmdir solo borra directorios vacíos; para los demás, rm -R.'],
 ['En una expresión regular de grep, ^ al principio significa…', ['Principio de línea','Fin de línea','Negación siempre','Cualquier carácter'], '^ = inicio de línea, $ = fin, . = un carácter, .* = cualquier cadena. Dentro de [^...] es negación.'],
 ['¿Por qué less es más rápido que more con ficheros grandes?', ['No necesita leer el fichero entero antes de mostrarlo','Muestra solo 10 líneas','Comprime el fichero','Está escrito en C'], 'Así lo explican los apuntes.'],
 ['¿Qué opción de tar LISTA el contenido de un archivo?', ['t','x','c','r'], 'c crear · x extraer · t listar · r añadir · u actualizar · v detallado · f fichero · z gzip.'],
 ['Los comodines * y ? …', ['No coinciden con ficheros que empiezan por punto','Coinciden con todo, incluidos ocultos','Solo funcionan con ls','Distinguen extensiones'], 'Los ficheros que empiezan por "." son ocultos y * no los incluye.'],
 ['¿Cómo determina Linux el tipo de un fichero (orden file)?', ['Por su cabecera / contenido','Por la extensión','Por el nombre del directorio','Por los permisos'], 'En Linux la extensión no es relevante.'],
 ],
 practice:[
 {q:'Crea de una vez los directorios anidados empresa/ventas/enero', sol:'mkdir -p empresa/ventas/enero', ok:[/^mkdir -p empresa\/ventas\/enero\/?$/, /^mkdir empresa\/ventas\/enero\/? -p$/], sh:'b'},
 {q:'Lista recursivamente todo el árbol desde / enviando los errores a /dev/null', sol:'ls -R / 2>/dev/null', ok:[/^ls -[a-zA-Z]*R[a-zA-Z]* \/ 2> ?\/dev\/null$/], sh:'b'},
 {q:'Muestra las líneas de /etc/passwd que TERMINAN en bash', sol:'grep "bash$" /etc/passwd', ok:[/^grep (["']?)bash\$\1 \/etc\/passwd$/], sh:'b'},
 {q:'Crea un enlace simbólico llamado acceso que apunte a /var/log/syslog', sol:'ln -s /var/log/syslog acceso', ok:['ln -s /var/log/syslog acceso'], sh:'b'},
 {q:'Empaqueta y comprime con gzip la carpeta apuntes en apuntes.tar.gz', sol:'tar -czvf apuntes.tar.gz apuntes', ok:[/^tar -?(?=[cvz]*c)(?=[cvz]*z)[cvz]+f apuntes\.tar\.gz apuntes\/?$/], sh:'b', exp:'La f va la última porque le sigue el nombre del fichero.'},
 {q:'Extrae el contenido de copia.tar', sol:'tar -xvf copia.tar', ok:[/^tar -?x?v?x?f copia\.tar$/, /^tar -?(?=[xv]*x)[xv]+f copia\.tar$/], sh:'b'},
 {q:'Cuenta las líneas de log.txt que contienen "error" sin distinguir mayúsculas', sol:'grep -ic "error" log.txt', ok:[/^grep (-ic|-ci|-i -c|-c -i) (["']?)error\2 log\.txt$/], sh:'b'},
 {q:'Añade el contenido de archivo2 al FINAL de archivo1', sol:'cat archivo2 >> archivo1', ok:[/^cat archivo2 ?>> ?archivo1$/], sh:'b'},
 ]},

{ id:'L2', icon:'👤', title:'Usuarios y grupos',
 theory:[
 ['¿Cuántos campos tiene cada línea de /etc/passwd?', ['7','9','4','6'], 'login:x:UID:GID:comentario:home:shell.'],
 ['¿Cuántos campos tiene cada línea de /etc/shadow?', ['9','7','4','8'], 'usuario:contraseña:d1:d2:d3:d4:d5:d6:reservado.'],
 ['¿Qué UID tiene siempre root?', ['0','1','1000','500'], 'root = UID 0. Cuentas de sistema < 500 (según apuntes), usuarios ≥ 1000.'],
 ['En /etc/shadow, un "!" en el campo de contraseña indica…', ['Cuenta bloqueada','Cuenta sin shell (nologin)','Contraseña vacía','Contraseña caducada'], '"!" bloqueada · "*" nologin.'],
 ['useradd -d /home/x SIN -m…', ['Asigna ese home pero no lo crea ni copia /etc/skel','Crea el directorio y copia /etc/skel','Da error','Borra el home anterior'], '-m es la que crea el home y copia /etc/skel.'],
 ['¿De dónde se copia el contenido inicial del home de un usuario nuevo?', ['/etc/skel','/etc/default','/home/default','/etc/login.defs'], 'useradd -m copia /etc/skel.'],
 ['usermod -G grupo usuario (sin -a)…', ['Sustituye todos sus grupos secundarios','Añade el grupo sin tocar los demás','Cambia el grupo principal','Crea el grupo'], 'Para añadir sin borrar: usermod -aG.'],
 ['¿Cuándo falla groupdel?', ['Si el grupo es el principal de algún usuario','Si el grupo tiene GID > 1000','Si el grupo está vacío','Nunca falla'], 'Hay que cambiar antes el grupo principal de esos usuarios.'],
 ['¿Qué fichero define rangos de UID y reglas del login?', ['/etc/login.defs','/etc/passwd','/etc/skel','/etc/shells'], ''],
 ['En /etc/shadow, d3 = -1 significa…', ['La contraseña nunca caduca','La cuenta está bloqueada','Debe cambiarla ya','Cuenta deshabilitada'], 'd3 = días de validez; -1 = nunca.'],
 ['¿Dónde está la contraseña cifrada de un grupo?', ['/etc/gshadow','/etc/group','/etc/shadow','/etc/passwd'], '/etc/group: nombre:x:GID:miembros.'],
 ['¿Por qué no se recomienda useradd -p?', ['La contraseña se vería en la línea de comandos','No funciona en Ubuntu','Bloquea la cuenta','Solo vale para root'], 'Se usa passwd usuario.'],
 ],
 practice:[
 {q:'Crea el usuario ana con directorio home y shell /bin/bash', sol:'useradd -m -s /bin/bash ana', ok:[T('useradd',[/ -m\b/,/ -s \/bin\/bash\b/],/ ana$/)], sh:'b'},
 {q:'Asigna una contraseña al usuario ana', sol:'passwd ana', ok:['passwd ana'], sh:'b'},
 {q:'Añade a ana al grupo sudo SIN quitarla de sus otros grupos', sol:'usermod -aG sudo ana', ok:[/^usermod (-aG|-Ga|-a -G) sudo ana$/, /^usermod -G sudo -a ana$/, 'gpasswd -a ana sudo', 'adduser ana sudo'], sh:'b'},
 {q:'Crea el grupo ventas con GID 1033', sol:'groupadd -g 1033 ventas', ok:['groupadd -g 1033 ventas'], sh:'b'},
 {q:'Elimina el usuario luis junto con su directorio home', sol:'userdel -r luis', ok:['userdel -r luis'], sh:'b'},
 {q:'Bloquea la cuenta de luis', sol:'usermod -L luis', ok:['usermod -L luis','passwd -l luis'], sh:'b'},
 {q:'Renombra el grupo ventas a comercial', sol:'groupmod -n comercial ventas', ok:['groupmod -n comercial ventas'], sh:'b'},
 {q:'Crea el usuario juanito con grupo principal compras, home /home/midir y shell /bin/sh (ejemplo de los apuntes)', sol:'useradd -g compras -d /home/midir -s /bin/sh juanito', ok:[T('useradd',[/ -g compras\b/,/ -d \/home\/midir\b/,/ -s \/bin\/sh\b/],/ juanito$/)], sh:'b'},
 {q:'Muestra los valores por defecto que usa useradd', sol:'useradd -D', ok:['useradd -D'], sh:'b'},
 ]},

{ id:'L3', icon:'🔐', title:'Permisos',
 theory:[
 ['rwxr-x--- en octal es…', ['750','755','740','650'], 'rwx=7, r-x=5, ---=0.'],
 ['¿Qué permite la x en un DIRECTORIO?', ['Entrar (acceder) al directorio','Ejecutar los ficheros de dentro','Listar su contenido','Borrar el directorio'], 'r = listar, w = crear/borrar dentro, x = acceder.'],
 ['¿Qué permite la w en un DIRECTORIO?', ['Crear y borrar ficheros dentro','Modificar el contenido de los ficheros','Entrar en él','Nada'], ''],
 ['chmod u=rw fichero…', ['Deja al propietario exactamente rw (quita x)','Añade rw al propietario','Quita rw al propietario','Da rw a todos'], '= fija los permisos exactos para esa entidad.'],
 ['¿Quién puede usar chmod sobre un fichero?', ['Su propietario y el administrador','Cualquier usuario','Solo root','Los miembros del grupo'], ''],
 ['644 equivale a…', ['rw-r--r--','rwxr--r--','rw-rw-r--','r--r--r--'], '6 = rw-, 4 = r--.'],
 ['En notación octal…', ['Hay que indicar siempre las 3 entidades','Puedes indicar solo el propietario','Se usan letras u g o','Solo existe para directorios'], ''],
 ['chmod a+r fichero…', ['Da lectura a usuario, grupo y otros','Quita lectura a todos','Da lectura solo a otros','Da todos los permisos'], 'a = all = ugo.'],
 ['El orden de los 9 caracteres de permisos es…', ['Usuario, grupo, otros','Otros, grupo, usuario','Grupo, usuario, otros','root, usuario, otros'], ''],
 ['Valor octal de r, w y x', ['4, 2, 1','1, 2, 4','2, 4, 1','4, 1, 2'], ''],
 ],
 practice:[
 {q:'Da permisos rwxr-xr-x a script.sh usando notación octal', sol:'chmod 755 script.sh', ok:['chmod 755 script.sh'], sh:'b'},
 {q:'Quita el permiso de escritura al grupo en informe.txt (notación simbólica)', sol:'chmod g-w informe.txt', ok:['chmod g-w informe.txt'], sh:'b'},
 {q:'Añade el permiso de ejecución al propietario de backup.sh (simbólica)', sol:'chmod u+x backup.sh', ok:['chmod u+x backup.sh'], sh:'b'},
 {q:'Deja datos.txt con lectura y escritura SOLO para el propietario (octal)', sol:'chmod 600 datos.txt', ok:['chmod 600 datos.txt'], sh:'b'},
 {q:'Haz que /datos y todo su contenido pertenezcan al usuario ana y al grupo ventas', sol:'chown -R ana:ventas /datos', ok:[/^chown -R ana[:.]ventas \/datos\/?$/, /^chown ana[:.]ventas \/datos\/? -R$/], sh:'b', exp:'chown no está en los apuntes del profe, pero en el práctico es imprescindible.'},
 {q:'Aplica permisos 770 a /compartida y todo su contenido', sol:'chmod -R 770 /compartida', ok:[/^chmod -R 770 \/compartida\/?$/], sh:'b'},
 {q:'Quita lectura y escritura a "otros" en notas.txt (simbólica)', sol:'chmod o-rw notas.txt', ok:['chmod o-rw notas.txt','chmod o-wr notas.txt'], sh:'b'},
 ]},

{ id:'L13', icon:'📊', title:'Servicios, procesos y eventos en Windows',
 theory:[
 ['svchost.exe es…', ['Un proceso que aloja varios servicios implementados en DLL','Un servicio','Un virus','El administrador de tareas'], ''],
 ['Cuenta de servicio con privilegios MÁXIMOS', ['LocalSystem','LocalService','NetworkService','Invitado'], ''],
 ['LocalService accede a otros equipos de la red…', ['De forma anónima','Con la cuenta del equipo','Como administrador','No puede'], ''],
 ['NetworkService accede a la red…', ['Con la cuenta del equipo local','De forma anónima','Con la cuenta del usuario','No accede'], ''],
 ['"Automático (inicio retrasado)" significa…', ['Arranca solo, pero después de los componentes más importantes','Solo arranca a mano','No puede iniciarse','Arranca al iniciar sesión'], ''],
 ['¿Qué tipo de inicio impide que el servicio arranque?', ['Deshabilitado','Manual','Automático retrasado','Start Pending'], 'Manual sí puede iniciarlo Windows, otro componente o el administrador.'],
 ['Estado "Start Pending"', ['Windows está intentando iniciarlo','Está parado','Está en ejecución','Ha fallado'], ''],
 ['¿Qué registro guarda los eventos de auditoría?', ['Seguridad','Sistema','Aplicación','Instalación'], ''],
 ['Para recopilar eventos de equipos remotos hace falta…', ['Una suscripción (Eventos reenviados)','Un recopilador de datos','Escritorio remoto','WinRM obligatorio en el cliente'], ''],
 ['Opción de tamaño máximo que borra los eventos más antiguos', ['Sobrescribir eventos si es necesario','Archivar el registro','No sobrescribir','Vaciar registro'], ''],
 ['Atajo del Administrador de tareas', ['Ctrl+Shift+Esc','Ctrl+Alt+T','Win+R','Ctrl+Shift+T'], ''],
 ['¿Qué pestaña del Administrador de tareas muestra el PID y la prioridad?', ['Detalles','Procesos','Rendimiento','Usuarios'], ''],
 ['Orden para abrir el Monitor de recursos', ['resmon','perfmon','taskmgr','eventvwr'], ''],
 ['¿Qué prioridad hay que usar con mucha precaución?', ['Tiempo real','Alta','Normal','Baja'], ''],
 ['En el Monitor de rendimiento, Ctrl+H…', ['Resalta el contador seleccionado','Abre la ayuda','Oculta el gráfico','Guarda el informe'], ''],
 ['Los conjuntos de recopiladores de datos sirven para…', ['Registrar contadores durante un tiempo y analizarlos después','Borrar eventos','Programar tareas','Matar procesos'], ''],
 ['Iconos de evento del Visor', ['Información, advertencia, error, auditoría correcta e incorrecta','Solo error y aviso','Verde, amarillo y rojo','Crítico y normal'], ''],
 ],
 practice:[
 {q:'Abre el Administrador de tareas desde la línea de órdenes', sol:'taskmgr', ok:['taskmgr','taskmgr.exe'], sh:'c', ci:true},
 {q:'Abre el Monitor de recursos', sol:'resmon', ok:['resmon','resmon.exe'], sh:'c', ci:true},
 {q:'(PowerShell) Muestra el estado del servicio WinRM', sol:'Get-Service WinRM', ok:[/^get-service (-name )?winrm$/], sh:'p', ci:true},
 {q:'(PowerShell) Finaliza el proceso con PID 4520', sol:'Stop-Process -Id 4520', ok:[/^stop-process -id 4520( -force)?$/], sh:'p', ci:true},
 {q:'(PowerShell) Pon el servicio Spooler en inicio Deshabilitado', sol:'Set-Service Spooler -StartupType Disabled', ok:[/^set-service (-name )?spooler -startuptype disabled$/], sh:'p', ci:true},
 {q:'(CMD) Muestra qué servicios hay dentro de cada proceso (svchost)', sol:'tasklist /svc', ok:['tasklist /svc'], sh:'c', ci:true},
 {q:'(CMD) Mata a la fuerza el proceso con PID 4520', sol:'taskkill /PID 4520 /F', ok:[/^taskkill (\/pid 4520 \/f|\/f \/pid 4520)$/], sh:'c', ci:true},
 {q:'Abre la consola de Servicios', sol:'services.msc', ok:['services.msc'], sh:'c', ci:true},
 {q:'Abre el Visor de eventos', sol:'eventvwr.msc', ok:['eventvwr.msc','eventvwr'], sh:'c', ci:true},
 ]},

];

// Variantes válidas extra por pregunta (además de las del banco).
const ALT: Record<string, Accept[]> = {
  'L1:p0':['mkdir --parents empresa/ventas/enero'],
  'L1:p1':['ls --recursive / 2>/dev/null'],
  'L1:p2':['grep /bash$ /etc/passwd','grep /bin/bash$ /etc/passwd','grep -E bash$ /etc/passwd','grep -e bash$ /etc/passwd','grep -E /bin/bash$ /etc/passwd',
           "awk '/bash$/' /etc/passwd","awk -F: '$7 ~ /bash$/' /etc/passwd", 'grep -w bash$ /etc/passwd', 'egrep bash$ /etc/passwd'],
  'L1:p3':['ln --symbolic /var/log/syslog acceso','ln -sf /var/log/syslog acceso'],
  'L1:p4':['tar -czf apuntes.tar.gz apuntes','tar --gzip -cf apuntes.tar.gz apuntes'],
  'L1:p5':['tar -xf copia.tar','tar --extract -f copia.tar'],
  'L1:p6':['grep -i error log.txt | wc -l','grep -c -i error log.txt','grep -ci error log.txt'],
  'L1:p7':['cat archivo2 | tee -a archivo1'],
  'L2:p0':['adduser ana','adduser --shell /bin/bash ana','useradd -m -s /bin/bash -U ana'],
  'L2:p1':['passwd -- ana'],
  'L2:p2':['usermod -a -G sudo ana','usermod --append --groups sudo ana','gpasswd -a ana sudo','gpasswd --add ana sudo','adduser ana sudo'],
  'L2:p3':['groupadd --gid 1033 ventas'],
  'L2:p4':['userdel --remove luis','deluser --remove-home luis'],
  'L2:p5':['passwd -l luis','usermod --lock luis','passwd --lock luis'],
  'L2:p6':['groupmod --new-name comercial ventas'],
  'L3:p0':['chmod 0755 script.sh','chmod u=rwx,g=rx,o=rx script.sh','chmod u=rwx,go=rx script.sh','chmod a=rx,u+w script.sh'],
  'L3:p1':['chmod g=r informe.txt'],
  'L3:p3':['chmod 0600 datos.txt','chmod u=rw,go= datos.txt','chmod u=rw,g=,o= datos.txt'],
  'L3:p4':['chown -R ana:ventas /datos','chown --recursive ana:ventas /datos'],
  'L3:p5':['chmod -R 0770 /compartida','chmod -R ug=rwx,o= /compartida','chmod -R u=rwx,g=rwx,o= /compartida'],
  'L3:p6':['chmod o-r-w notas.txt','chmod o-w-r notas.txt'],
  'L13:p2':['gsv winrm','get-service -name winrm','sc query winrm'],
  'L13:p3':['stop-process 4520','spps -id 4520','taskkill /pid 4520','kill 4520'],
  'L13:p4':['sc config spooler start= disabled','set-service -name spooler -startuptype disabled'],
  'L13:p6':['taskkill /pid 4520 /f /t','stop-process -id 4520 -force'],
};

for (const L of LEVELS) {
  L.practice.forEach((p, i) => {
    const extra = ALT[`${L.id}:p${i}`];
    if (extra) p.ok = p.ok.concat(extra);
  });
}

const BANK: MockLevel[] = LEVELS.map(({ id, icon, title, theory, practice }) => ({ id, icon, title, theory, practice }));
export const mockLevels = (): readonly MockLevel[] => BANK;
const LV = new Map(BANK.map((l) => [l.id, l]));

/** Todas las preguntas de un banco, con su id estable. */
export const allItems = (lids: string[]): QuestItem[] =>
  lids.flatMap((lid) => {
    const L = LV.get(lid);
    if (!L) return [];
    return [
      ...L.theory.map((t, i): QuestItem => ({ id: `${lid}:t${i}`, lid, type: "t", t })),
      ...L.practice.map((p, i): QuestItem => ({ id: `${lid}:p${i}`, lid, type: "p", p })),
    ];
  });

/** Resuelve un id guardado (mazmorra); ids que ya no existen se ignoran. */
export function itemById(id: string): QuestItem | null {
  const m = /^(L\d+):([tp])(\d+)$/.exec(id);
  if (!m) return null;
  const L = LV.get(m[1]);
  if (!L) return null;
  const n = Number(m[3]);
  if (m[2] === "t") return L.theory[n] ? { id, lid: m[1], type: "t", t: L.theory[n] } : null;
  return L.practice[n] ? { id, lid: m[1], type: "p", p: L.practice[n] } : null;
}

/** Banco mock del nivel nº `n` (1…): se reparte por rotación entre los bancos disponibles. */
export const bankIdFor = (n: number) => BANK[(Math.max(1, n) - 1) % BANK.length].id;
export const levelItems = (n: number): QuestItem[] => allItems([bankIdFor(n)]);
export const bankTitle = (lid: string) => LV.get(lid)?.title ?? lid;
export const bankIcon = (lid: string) => LV.get(lid)?.icon ?? "🎮";
/** Jefe: mezcla de todos los bancos (6 de teoría + 4 de práctica). */
export const BOSS_COUNTS = { t: 6, p: 4 } as const;
export const bossPool = (): QuestItem[] => allItems(BANK.map((l) => l.id));
