import { describe, expect, it } from "vitest";

import { canon, check, norm, whyWrong, type Practice } from "./quest-engine";
import { mockLevels } from "./quest-mock";

const P = (sol: string, sh: Practice["sh"] = "b", ci = false, ok: Practice["ok"] = []): Practice => ({ q: "", sol, ok, sh, ci });
const same = (sol: string, ...answers: string[]) => {
  for (const a of answers) expect(check(P(sol), a), a).toBe(true);
};
const differ = (sol: string, ...answers: string[]) => {
  for (const a of answers) expect(check(P(sol), a), a).toBe(false);
};

describe("banco mock", () => {
  it("la solución de referencia y cada variante de texto del banco se aceptan", () => {
    let n = 0;
    for (const L of mockLevels())
      for (const p of L.practice) {
        expect(check(p, p.sol), `${L.id}: ${p.sol}`).toBe(true);
        for (const o of p.ok) if (typeof o === "string") expect(check(p, o), `${L.id}: ${o}`).toBe(true);
        n++;
      }
    expect(n).toBeGreaterThan(25);
  });
  it("las variantes extra (ALT) se fusionan con las del banco", () => {
    const p = mockLevels()[0].practice[0];
    expect(check(p, "mkdir --parents empresa/ventas/enero")).toBe(true);
    expect(check(p, "mkdir empresa/ventas/enero -p")).toBe(true);
  });
  it("cada pregunta de teoría trae 4 opciones distintas", () => {
    for (const L of mockLevels()) for (const t of L.theory) expect(new Set(t[1]).size, t[0]).toBe(4);
  });
});

describe("norm", () => {
  it("normaliza comillas, tabuladores, sudo, ';' final y espacios en redirecciones", () => {
    expect(norm("  sudo  ls\t-la; ")).toBe("ls -la");
    expect(norm("echo “hola”")).toBe('echo "hola"');
    expect(norm("cat a>>b")).toBe("cat a >> b");
    expect(norm("ls 2>/dev/null")).toBe("ls 2> /dev/null");
    expect(norm("ls | wc")).toBe("ls | wc");
    expect(norm("sudo -i ls")).toBe("ls");
  });
  it("ci pasa a minúsculas; sh='f' no toca las redirecciones", () => {
    expect(norm("Get-Service WinRM", true)).toBe("get-service winrm");
    expect(norm("a>b", false, "f")).toBe("a>b");
  });
});

describe("canon · opciones equivalentes", () => {
  it("agrupadas, separadas y reordenadas", () => {
    same("tar -czvf apuntes.tar.gz apuntes", "tar -czf apuntes.tar.gz apuntes", "tar czf apuntes.tar.gz apuntes", "tar -zcvf apuntes.tar.gz apuntes");
    same("grep -ic error log.txt", "grep -ci error log.txt", "grep -i -c error log.txt");
    same("mkdir -p a/b", "mkdir a/b -p", "mkdir --parents a/b");
  });
  it("opciones largas y --clave=valor", () => {
    same("journalctl -u apache2 -n 20", "journalctl --unit=apache2 --lines=20", "journalctl --unit apache2 --lines 20", "journalctl -n20 -uapache2");
    same("useradd -m -s /bin/bash ana", "useradd --create-home --shell /bin/bash ana", "useradd -s /bin/bash -m ana");
  });
  it("EQUIV: cp -r ≡ cp -R, rm -r ≡ rm -R, grep -R ≡ grep -r", () => {
    same("cp -R a b", "cp -r a b");
    same("rm -R d", "rm -r d");
    same("grep -r x .", "grep -R x .");
  });
  it("-v es cosmético donde está en VERB y -y se ignora en apt", () => {
    same("chmod -R 770 /x", "chmod -Rv 770 /x");
    same("apt install ssh", "apt install -y ssh");
    differ("grep x f", "grep -v x f");
  });
  it("sudo, comillas, barra final y ./ no cambian el comando", () => {
    same("mkdir -p empresa/ventas", "sudo mkdir -p empresa/ventas/", "mkdir -p 'empresa/ventas'");
    same('grep "bash$" /etc/passwd', "grep bash$ /etc/passwd", "grep 'bash$' /etc/passwd");
  });
  it("redirecciones con o sin espacios y orden de la tubería con cat", () => {
    same("ls -R / 2>/dev/null", "ls -R / 2> /dev/null", "ls -R / 2>/dev/null");
    same("cat archivo2 >> archivo1", "cat archivo2>>archivo1");
    expect(canon("cat f | grep x")).toBe(canon("grep x f"));
  });
  it("rutas /dev/mapper/vg-lv ≡ /dev/vg/lv y .service", () => {
    expect(canon("resize2fs /dev/mapper/datos-home")).toBe(canon("resize2fs /dev/datos/home"));
    same("systemctl status ssh", "systemctl status ssh.service");
  });
  it("tar sin guion inicial", () => {
    same("tar -xvf copia.tar", "tar xvf copia.tar", "tar xf copia.tar");
  });
});

describe("check · Windows (sin distinguir mayúsculas)", () => {
  const ps = (sol: string) => P(sol, "p", true);
  it("alias y parámetro posicional", () => {
    const p = ps("Get-Service WinRM");
    for (const a of ["gsv winrm", "get-service -name winrm", "GET-SERVICE WINRM", "Get-Service -Name WinRM"]) expect(check(p, a), a).toBe(true);
    expect(check(p, "get-service spooler")).toBe(false);
    expect(check(ps("Stop-Process -Id 4520"), "spps 4520")).toBe(true);
    expect(check(ps("Set-Service Spooler -StartupType Disabled"), "set-service -name spooler -startuptype disabled")).toBe(true);
  });
  it("cmd: parámetros en cualquier orden", () => {
    const c = P("taskkill /PID 4520 /F", "c", true);
    expect(check(c, "TASKKILL /F /PID 4520")).toBe(true);
    expect(check(c, "taskkill /pid 4521 /f")).toBe(false);
  });
  it("funciones y regex del banco (T) aceptan formas válidas", () => {
    const L = mockLevels().find((l) => l.id === "L13")!;
    const kill = L.practice.find((p) => p.sol.startsWith("taskkill"))!;
    expect(check(kill, "taskkill /pid 4520 /f")).toBe(true);
    const pids = L.practice.find((p) => p.sol.startsWith("Stop-Process"))!;
    expect(check(pids, "Stop-Process -Id 4520 -Force")).toBe(true);
  });
});

describe("check · rechazos", () => {
  it("vacío y comandos distintos", () => {
    differ("ls -l", "", "   ", "ls -a", "ls");
  });
  it("las opciones con valor no se confunden", () => {
    differ("useradd -m -s /bin/bash ana", "useradd -m -s /bin/sh ana", "useradd -m ana");
    differ("chmod 755 script.sh", "chmod 644 script.sh");
  });
  it("sh='f' compara la línea tal cual", () => {
    expect(check(P("DHCP=true", "f"), "DHCP=true")).toBe(true);
    expect(check(P("DHCP=true", "f"), "dhcp=true")).toBe(false);
  });
  it("RegExp y función del banco, y que no sean fáciles de saltarse", () => {
    const p = P("ln -s a b", "b", false, [/^ln -s a b$/, (s: string) => s === "link"]);
    expect(check(p, "link")).toBe(true);
    expect(check(p, "ln -s a  b")).toBe(true);
    expect(check(p, "ln -s b a")).toBe(false);
  });
});

describe("whyWrong", () => {
  it("explica los errores típicos", () => {
    expect(whyWrong(P("usermod -aG sudo ana"), "usermod -G sudo ana")).toMatch(/REEMPLAZA/);
    expect(whyWrong(P("kill -9 1234"), "kill 1234")).toMatch(/SIGTERM/);
    expect(whyWrong(P("ls -R / 2>/dev/null"), "ls -R / 2 >/dev/null")).toMatch(/2>/);
    expect(whyWrong(P("systemctl start ssh"), "systemctl enable ssh")).toMatch(/enable/);
    expect(whyWrong(P("chmod -R 770 /x"), "chmod 770 /x")).toMatch(/-R/);
  });
  it("sin respuesta o sin coincidencia devuelve vacío", () => {
    expect(whyWrong(P("ls"), null)).toBe("");
    expect(whyWrong(P("ls"), "ls -l")).toBe("");
  });
});
