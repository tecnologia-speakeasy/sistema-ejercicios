"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { destinoSeguro } from "@/lib/auth/destino";
import { Boton } from "@/app/components/ui/Boton";
import { Campo, Entrada } from "@/app/components/ui/Campo";

// Login unificado (como sistema-evaluaciones, sin código por correo):
// primero el correo (/api/auth/identify).
//   · staff      → contraseña (/api/auth/staff-login)
//   · estudiante → su nombre (/api/auth/estudiante-login)
// El nombre se recuerda en este navegador para la próxima vez.

type RespuestaIdentify = { tipo: "staff" } | { tipo: "estudiante" } | { tipo: "no_autorizado" };

const NO_AUTORIZADO =
  "Este correo no está autorizado. Si crees que es un error, escribe a tu coordinador académico.";
const SIN_CONEXION = "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
const CLAVE_NOMBRE = "se_nombre_estudiante";
const nombreValido = (n: string) => n.replace(/\s+/g, " ").trim().length >= 2;

function nombreRecordado(): string {
  try {
    return localStorage.getItem(CLAVE_NOMBRE) ?? "";
  } catch {
    return "";
  }
}
function recordarNombre(nombre: string) {
  try {
    localStorage.setItem(CLAVE_NOMBRE, nombre.replace(/\s+/g, " ").trim());
  } catch {
    // Sin almacenamiento (modo privado): la próxima vez lo vuelve a escribir.
  }
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, data };
}

export default function LoginForm() {
  const next = useSearchParams().get("next");
  const [paso, setPaso] = useState<"email" | "password" | "nombre">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function identificar(): Promise<boolean> {
    const { ok, data } = await postJson("/api/auth/identify", { email });
    if (!ok) {
      setError(data?.error ?? SIN_CONEXION);
      return false;
    }
    const r = data as RespuestaIdentify;
    if (r.tipo === "staff") setPaso("password");
    else if (r.tipo === "estudiante") {
      if (!nombre) setNombre(nombreRecordado());
      setPaso("nombre");
    } else setError(NO_AUTORIZADO);
    return false;
  }

  async function ingresarStaff(): Promise<boolean> {
    const { ok, data } = await postJson("/api/auth/staff-login", { email, password });
    if (!ok) {
      setError(data?.error ?? SIN_CONEXION);
      return false;
    }
    window.location.assign(destinoSeguro(next, "staff"));
    return true;
  }

  async function ingresarEstudiante(): Promise<boolean> {
    const { ok, data } = await postJson("/api/auth/estudiante-login", { email, nombre });
    if (!ok) {
      setError(data?.error ?? SIN_CONEXION);
      return false;
    }
    recordarNombre(nombre);
    // Recarga completa para que el proxy vea la cookie nueva.
    window.location.assign(destinoSeguro(next, "estudiante"));
    return true;
  }

  async function enviar(accion: () => Promise<boolean>) {
    setError(null);
    setEnviando(true);
    let navegando = false;
    try {
      navegando = await accion();
    } catch {
      setError(SIN_CONEXION);
    } finally {
      if (!navegando) setEnviando(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!puedeEnviar) return;
    if (paso === "email") void enviar(identificar);
    else if (paso === "password") void enviar(ingresarStaff);
    else void enviar(ingresarEstudiante);
  }

  function cambiarCorreo() {
    setPaso("email");
    setPassword("");
    setError(null);
  }

  const puedeEnviar =
    Boolean(email.trim()) &&
    (paso === "email" || (paso === "password" && Boolean(password)) || (paso === "nombre" && nombreValido(nombre)));

  const botonCambiarCorreo = (
    <button
      type="button"
      onClick={cambiarCorreo}
      className="mb-2 cursor-pointer text-[13px] text-white/80 underline-offset-2 hover:text-white hover:underline"
    >
      Cambiar correo
    </button>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      <Campo
        etiqueta="Correo electrónico"
        htmlFor="email"
        tono="oscuro"
        className="mb-[18px]"
        accion={paso === "nombre" ? botonCambiarCorreo : null}
      >
        <Entrada
          id="email"
          tono="oscuro"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Ej. maria.garcia@email.com"
          required
          autoFocus
          readOnly={paso !== "email"}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
        />
      </Campo>

      {paso === "password" && (
        <Campo etiqueta="Contraseña" htmlFor="password" tono="oscuro" className="mb-[18px]" accion={botonCambiarCorreo}>
          <Entrada
            id="password"
            tono="oscuro"
            type="password"
            autoFocus
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Campo>
      )}

      {paso === "nombre" && (
        <Campo
          etiqueta="Nombre"
          htmlFor="nombre"
          tono="oscuro"
          className="mb-[18px]"
          ayuda="Así aparecerá en tu progreso."
        >
          <Entrada
            id="nombre"
            tono="oscuro"
            name="name"
            autoComplete="name"
            autoCapitalize="words"
            placeholder="Ej. María García López"
            maxLength={120}
            required
            autoFocus
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setError(null);
            }}
          />
        </Campo>
      )}

      <div aria-live="polite">
        {error && <p className="-mt-2.5 mb-3.5 text-[13px] leading-snug text-error-claro">{error}</p>}
      </div>

      <Boton
        type="submit"
        variante="degradado"
        tamano="lg"
        ancho
        className="mt-1.5 disabled:!opacity-90"
        disabled={enviando || !puedeEnviar}
      >
        {enviando ? "Ingresando…" : "Ingresar"}
      </Boton>
    </form>
  );
}
