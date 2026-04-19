"use client";

import { useEffect, useState } from "react";

/**
 * Producción: registra SW (`/sw-admin.js`, alcance `/admin`).
 * Sin red: aviso claro; API y BD siguen en el servidor.
 */
export function AdminOfflineSupport() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    function on() {
      setOnline(true);
    }
    function off() {
      setOnline(false);
    }
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker
      .register("/sw-admin.js", { scope: "/admin" })
      .catch(() => {
        /* CSP o modo privado pueden impedir SW */
      });
  }, []);

  if (!online) {
    return (
      <div
        className="no-print border-b border-amber-500/40 bg-amber-950/50 px-4 py-3 text-center text-sm text-amber-100 md:px-6 md:text-left"
        role="alert"
      >
        <strong className="text-amber-50">Sin conexión.</strong> Puedes abrir vistas del panel que
        ya visitaste con la red (caché local). Para datos nuevos o guardar cambios hace falta
        internet: el servidor y la base de datos siguen en la nube.
      </div>
    );
  }

  return null;
}
