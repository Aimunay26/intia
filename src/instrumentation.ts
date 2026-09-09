export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const { isStrongSecret } = await import("./lib/auth-policy");
    if (!isStrongSecret(process.env.AUTH_SECRET)) {
      console.error("[auth] AUTH_SECRET debe contener una clave aleatoria válida de al menos 32 caracteres; no se admiten valores de ejemplo ni espacios.");
      // Next puede capturar un rechazo de register() y dejar el listener activo.
      // Fallar el proceso de inicialización hace que el host detecte la configuración inválida.
      process.exit(1);
    }
  }
}
