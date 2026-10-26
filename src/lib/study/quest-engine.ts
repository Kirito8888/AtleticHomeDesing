// Modo Juego · motor de corrección de comandos (lógica pura, sin React).
// Port casi literal del motor de ASO_Quest.html: `norm`, `canon`, `check` y los diccionarios de opciones
// equivalentes (cortas/largas, agrupadas y reordenadas, alias de PowerShell…). No simplificar: la tolerancia
// a comandos equivalentes es justo lo que hace jugable la práctica.

export type Shell = "b" | "p" | "c" | "f";
export type Accept = string | RegExp | ((s: string) => boolean);
export interface Practice {
  q: string;
  sol: string;
  ok: Accept[];
  sh: Shell;
  ci?: boolean;
  exp?: string;
}
/** [pregunta, [correcta, mala1, mala2, mala3], explicación] */
export type Theory = [string, string[], string?];

export const PROMPT: Record<Shell, string> = { b: "aso@aso:~$", p: "PS C:\\>", c: "C:\\>", f: "✎ línea:" };

// ======== Motor de corrección: acepta formas equivalentes de un comando ========
// Opciones cortas que llevan valor, por comando (estilo getopt)
const VAL: Record<string, string> = {
  useradd:'sgGdcueKkp', usermod:'sgGdcuel', groupadd:'g', groupmod:'ng', chage:'mMWIEd', adduser:'',
  lvcreate:'Lln', lvextend:'Ll', lvreduce:'Ll', mkfs:'t', mke2fs:'tLb', 'mkfs.ext4':'Lb', mount:'to',
  journalctl:'unpb', renice:'npgu', nice:'n', strace:'ep', 'ssh-keygen':'tCfb', ssh:'lpi', sort:'kto',
  grep:'ef', ps:'uop', kill:'s', tar:'fC', mdadm:'Cln', cut:'df', head:'n', tail:'n', crontab:'u', mkdir:'m', chsh:'s',
};
// Opciones largas → corta equivalente
const LONG: Record<string, string> = {
  '--create-home':'-m','--shell':'-s','--home-dir':'-d','--home':'-d','--gid':'-g','--groups':'-G','--uid':'-u',
  '--comment':'-c','--append':'-a','--lock':'-L','--unlock':'-U','--remove':'-r','--force':'-f','--login':'-l',
  '--new-name':'-n','--ignore-case':'-i','--count':'-c','--invert-match':'-v','--line-number':'-n','--word-regexp':'-w',
  '--files-with-matches':'-l','--parents':'-p','--symbolic':'-s','--size':'-L','--name':'-n','--extents':'-l',
  '--resizefs':'-r','--type':'-t','--options':'-o','--read-only':'-r','--unit':'-u','--lines':'-n','--priority':'-p',
  '--follow':'-f','--boot':'-b','--list':'-l','--edit':'-e','--level':'-l','--raid-devices':'-n','--create':'-C',
  '--show-pids':'-p','--numeric-sort':'-n','--reverse':'-r','--unique':'-u','--key':'-k','--field-separator':'-t',
  '--output':'-o','--all':'-a','--recursive':'-R','--signal':'-s','--adjustment':'-n','--pid':'-p','--extended-regexp':'-E',
  '--regexp':'-e','--gzip':'-z','--extract':'-x','--file':'-f','--verbose':'-v','--assume-yes':'-y','--yes':'-y',
};
const EQUIV: Record<string, Record<string, string>> = { cp:{'-r':'-R'}, rm:{'-r':'-R'}, grep:{'-R':'-r'} };
// -v (detallado) es cosmético en estos comandos: se ignora
const VERB = new Set(['tar','cp','mv','rm','mkdir','rmdir','chmod','chown','chgrp','mkfs','mkfs.ext4','mke2fs','mount','umount','ln','pvcreate','vgcreate','vgextend','lvcreate','lvextend']);
const DROPY = new Set(['apt','apt-get']);
// Windows: parámetros con valor y alias
const WVAL = new Set(['/tn','/tr','/sc','/st','/mo','/d','/m','/sd','/ed','/ru','/rp','/s','/pid','/im','/fi',
  '-computername','-credential','-name','-id','-startuptype','-value','-filepath','-path','-displayname','-logname','-newest']);
const WALIAS: Record<string, string> = { kill:'stop-process', gsv:'get-service', sasv:'start-service', spsv:'stop-service', spps:'stop-process', gps:'get-process', etsn:'enter-pssession', ps:'get-process' };
const WPARAM: Record<string, string> = { '-cn':'-computername', '-n':'-name' };
const WPOS1: Record<string, string> = { 'get-service':'-name','start-service':'-name','stop-service':'-name','restart-service':'-name','set-service':'-name',
  'get-process':'-name','stop-process':'-id','enter-pssession':'-computername','set-item':'-path' };
const CONSUMERS = new Set(['grep','sort','head','tail','wc','uniq','cut','awk','more','less']);

export function norm(s: string, ci?: boolean, sh?: Shell): string {
  s = String(s).replace(/[“”«»]/g,'"').replace(/[‘’]/g,"'").replace(/\t/g,' ').trim();
  if (sh !== 'f') {
    const FD = ['2>&1','2>>','2>','&>'];
    s = s.replace(/\s*\|\s*/g, ' | ')
         .replace(/(^|\s)(2>&1|2>>|2>|&>)\s*/g, (m, a, b) => ' \u0001' + FD.indexOf(b) + ' ')
         .replace(/\s*(>>|>|<)\s*/g, ' $1 ')
         .replace(/\u0001(\d)/g, (m, k) => FD[+k]);
  }
  s = s.replace(/\s+/g,' ').trim().replace(/^sudo (-s |-i )?/,'').replace(/;$/,'').trim();
  return ci ? s.toLowerCase() : s;
}
const stripQ = (s: string) => s.replace(/["']/g, '');

function canonSeg(seg: string, ci?: boolean): string {
  const t = seg.split(' ').filter(Boolean); if (!t.length) return '';
  let cmd = t[0];
  if (ci && WALIAS[cmd]) cmd = WALIAS[cmd];
  const val = VAL[cmd] || '';
  const groups: string[] = [], pos: string[] = [];
  if (cmd === 'tar' && t[1] && /^[a-zA-Z]+$/.test(t[1])) t[1] = '-' + t[1];
  let i = 1;
  while (i < t.length) {
    let x = t[i];
    if (x === '2>&1') { groups.push(x); i++; continue; }
    if (/^(&>|2>>|2>|>>|>|<)$/.test(x)) { groups.push(x + ' ' + (t[i+1] || '')); i += 2; continue; }
    if (ci) {
      if (WPARAM[x]) x = WPARAM[x];
      if (/^[-\/][a-z]/.test(x)) {
        if (WVAL.has(x)) { groups.push(x + ' ' + (t[i+1] || '')); i += 2; } else { groups.push(x); i++; }
        continue;
      }
      pos.push(x); i++; continue;
    }
    if (/^--[\w-]+=/.test(x)) { const k = x.indexOf('='); t.splice(i, 1, x.slice(0, k), x.slice(k + 1)); x = t[i]; }
    if (LONG[x]) x = LONG[x];
    if (/^-[A-Za-z]/.test(x)) {
      if (x.startsWith('--')) { groups.push(x); i++; continue; }
      const L = x.slice(1); let consumed = false;
      for (let j = 0; j < L.length; j++) {
        let f = '-' + L[j]; f = (EQUIV[cmd] || {})[f] || f;
        if (val.includes(L[j])) { let v = L.slice(j + 1); if (!v) { v = t[i+1] || ''; consumed = true; } groups.push(f + ' ' + v); break; }
        if (f === '-v' && VERB.has(cmd)) continue;
        if (f === '-y' && DROPY.has(cmd)) continue;
        groups.push(f);
      }
      i += consumed ? 2 : 1; continue;
    }
    pos.push(x); i++;
  }
  if (ci && WPOS1[cmd] && pos.length && !groups.some(g => g.startsWith(WPOS1[cmd] + ' '))) groups.push(WPOS1[cmd] + ' ' + pos.shift());
  return cmd + ' {' + groups.sort().join(',') + '} ' + pos.join(' ');
}
export function canon(s: string, ci?: boolean, sh?: Shell): string {
  s = stripQ(norm(s, ci, sh));
  if (sh === 'f') return s;
  s = s.replace(/\/dev\/mapper\/(\w+)-(\w+)/g, '/dev/$1/$2')
       .replace(/(\S)\/(?= |$)/g, '$1')
       .replace(/ \.\//g, ' ')
       .replace(/\b([\w@-]+)\.service\b/g, '$1');
  const segs = s.split(' | ');
  if (segs.length > 1) {
    const m = segs[0].match(/^cat (\S+)$/);
    const nx = segs[1].split(' ')[0];
    if (m && CONSUMERS.has(nx)) { segs[1] = segs[1] + ' ' + m[1]; segs.shift(); }
  }
  return segs.map(x => canonSeg(x, ci)).join(' | ');
}
export function check(it: Pick<Practice, "sol" | "ok" | "sh" | "ci">, input: string): boolean {
  const s = norm(input, it.ci, it.sh);
  if (!s) return false;
  const forms = [s, stripQ(s)];
  const c = canon(input, it.ci, it.sh);
  return [it.sol, ...it.ok].some(o =>
    typeof o === 'string' ? canon(o, it.ci, it.sh) === c :
    o instanceof RegExp ? forms.some(f => o.test(f)) : forms.some(f => o(f)));
}

// ======== Explicación de errores típicos ========
const MISTAKES: [(a: string, s: string) => boolean, string][] = [
  [(a: string, s: string) => /^ls\b/.test(a) && !/^ls\b/.test(s), 'ls lista NOMBRES de ficheros, no su contenido. Para buscar dentro de un fichero: grep PATRÓN FICHERO.'],
  [(a: string) => /grep [^'"|]*\*/.test(a), 'Sin comillas, el shell expande el * antes de que grep lo vea. Además, en una expresión regular * no significa "cualquier cosa": repite el carácter anterior. "Termina en bash" se escribe "bash$".'],
  [(a: string, s: string) => /\bgrep\b/.test(s) && /\$/.test(s) && /\bgrep\b/.test(a) && !/\$/.test(a), 'Falta el ancla $ (fin de línea): sin ella coincide "bash" en cualquier parte de la línea.'],
  [(a: string, s: string) => /usermod/.test(a) && /-G\b/.test(a) && !/-\w*a/.test(a) && /-aG|-a /.test(s), 'usermod -G sin -a REEMPLAZA todos los grupos secundarios. Para añadir: -aG.'],
  [(a: string, s: string) => /lv(extend|reduce)/.test(a) && /-[lL] ?\d/.test(a) && /\+/.test(s), 'Sin el "+" el tamaño es absoluto ("dejar en"), no "ampliar en".'],
  [(a: string, s: string) => /^kill \d+$/.test(a) && /-9|kill/i.test(s) && /-9|-KILL|SIGKILL/.test(s), 'kill sin señal envía la 15 (SIGTERM), que el proceso puede ignorar. Forzar = -9.'],
  [(a: string, s: string) => /^(chmod|chown)\b/.test(a) && /-R\b/.test(s) && !/-R\b/.test(a), 'Falta -R: sin ella solo cambia el directorio, no su contenido.'],
  [(a: string) => /2 >/.test(a), 'Entre el 2 y el > no puede haber espacio: "2>" es un solo operador.'],
  [(a: string, s: string) => /^useradd/.test(a) && /-m\b/.test(s) && !/-\w*m\b|--create-home/.test(a), 'Sin -m no se crea el directorio home.'],
  [(a: string, s: string) => /systemctl enable/.test(a) && /systemctl start/.test(s), 'enable ≠ start: enable solo lo programa para el arranque; start lo arranca ahora.'],
  [(a: string, s: string) => /systemctl start/.test(a) && /systemctl enable/.test(s), 'start ≠ enable: start lo arranca ahora; enable hace que arranque al iniciar el sistema.'],
  [(a: string) => /ssh keygen/i.test(a), 'Es ssh-keygen, con guion. "ssh keygen" intenta conectarse a un equipo llamado keygen.'],
  [(a: string, s: string) => /^[\d*\/,-]+( [\d*\/,a-z-]+){5,}$/i.test(a) && /^[\d*\/,-]+( [\d*\/,a-z-]+){4}$/i.test(s), 'Cron tiene 5 campos de tiempo: minuto, hora, día del mes, mes, día de la semana.'],
  [(a: string, s: string) => /^chmod [0-7]{3}/.test(s) && /^chmod [0-7]{3}/.test(a), 'Revisa la suma: r = 4, w = 2, x = 1, en el orden usuario | grupo | otros.'],
];
export function whyWrong(d: Pick<Practice, "sol" | "sh">, ans: string | null): string {
  if (!ans) return '';
  const a = norm(ans, false, d.sh), s = d.sol;
  return MISTAKES.filter(([f]) => { try { return f(a, s); } catch { return false; } }).map(m => m[1]).join(' · ');
}
