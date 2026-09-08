"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { borrarAssetsDe } from "@/lib/assets-cleanup";
import { requireUser, requireLevel, can, LEVEL } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { CORREOS_DE_EJEMPLO, MARCA_DE_EJEMPLO } from "@/lib/datos-de-ejemplo";

/**
 * Vaciar los datos de ejemplo que se sembraron para que la app no naciera vacía.
 *
 * Es la única acción del sistema que borra muchas filas de golpe, así que va en
 * dos tiempos a propósito: primero se cuenta y se enseña, y solo después, con
 * una confirmación escrita, se borra. Un botón que borra al primer clic es un
 * accidente esperando a ocurrir.
 */

export type Recuento = {
  marca: string | null;
  objetivos: number;
  videos: number;
  guiones: number;
  escenas: number;
  metricas: number;
  eventos: number;
  cuentas: string[];
  perfilesGenericos: number;
  archivos: number;
  /** Lo que se conserva, para poder enseñarlo al lado y que no dé miedo. */
  seConserva: {
    personas: number;
    estructuras: number;
    movimientos: number;
  };
};

/** Cuenta lo que se iría. No borra nada. */
export async function contarDatosDeEjemplo(): Promise<Recuento> {
  await requireLevel(LEVEL.OWNER);

  const marca = await prisma.brand.findUnique({
    where: { slug: MARCA_DE_EJEMPLO },
    select: { id: true, name: true },
  });

  const idsGuiones = marca
    ? (await prisma.script.findMany({ where: { brandId: marca.id }, select: { id: true } })).map(
        (s) => s.id
      )
    : [];

  const idsVideos = marca
    ? (
        await prisma.contentItem.findMany({
          where: { brandId: marca.id },
          select: { id: true },
        })
      ).map((c) => c.id)
    : [];

  const [objetivos, escenas, metricas, eventos, cuentas, perfilesGenericos, personas, estructuras, movimientos] =
    await Promise.all([
      marca ? prisma.brandObjective.count({ where: { brandId: marca.id } }) : 0,
      idsGuiones.length
        ? prisma.scriptScene.count({ where: { scriptId: { in: idsGuiones } } })
        : 0,
      idsVideos.length
        ? prisma.metric.count({ where: { contentItemId: { in: idsVideos } } })
        : 0,
      marca ? prisma.calendarEvent.count({ where: { brandId: marca.id } }) : 0,
      prisma.user.findMany({
        where: { email: { in: CORREOS_DE_EJEMPLO } },
        select: { name: true },
        orderBy: { name: "asc" },
      }),
      prisma.archetype.count({ where: { isPerson: false } }),
      prisma.archetype.count({ where: { isPerson: true } }),
      prisma.structure.count(),
      prisma.auditLog.count(),
    ]);

  // Los adjuntos de todo lo que se va: no tienen clave ajena, así que nadie
  // los borra por nosotros y quedarían ocupando espacio para siempre.
  const duenos: { tipo: string; ids: string[] }[] = [
    { tipo: "brand", ids: marca ? [marca.id] : [] },
    { tipo: "content", ids: idsVideos },
  ];
  const genericos = await prisma.archetype.findMany({
    where: { isPerson: false },
    select: { id: true },
  });
  duenos.push({ tipo: "archetype", ids: genericos.map((g) => g.id) });

  let archivos = 0;
  for (const d of duenos) {
    if (!d.ids.length) continue;
    archivos += await prisma.asset.count({
      where: { ownerType: d.tipo, ownerId: { in: d.ids } },
    });
  }

  return {
    marca: marca?.name ?? null,
    objetivos,
    videos: idsVideos.length,
    guiones: idsGuiones.length,
    escenas,
    metricas,
    eventos,
    cuentas: cuentas.map((c) => c.name),
    perfilesGenericos,
    archivos,
    seConserva: { personas, estructuras, movimientos },
  };
}

export type VaciarState = { error?: string; ok?: string } | null;

/**
 * Borra de verdad. Exige ser dueño y escribir la palabra de confirmación.
 *
 * El orden importa y no es el obvio: `Script.brandId` y `CalendarEvent.brandId`
 * están declarados como "poner a null" al borrar la marca, no como cascada. Si
 * se borrara la marca primero, los guiones y los eventos sobrevivirían sueltos
 * y el botón habría dejado la casa a medio limpiar.
 */
export async function vaciarDatosDeEjemplo(
  _prev: VaciarState,
  formData: FormData
): Promise<VaciarState> {
  const user = await requireUser();

  // No se usa requireLevel: lanza, y dentro de useActionState un fallo de
  // permisos se convertiria en la pantalla de error en vez de un mensaje.
  if (!can(user.role, LEVEL.OWNER)) {
    return { error: "Solo el dueño puede vaciar los datos de ejemplo." };
  }

  const confirmacion = String(formData.get("confirmacion") ?? "").trim().toUpperCase();
  if (confirmacion !== "VACIAR") {
    return { error: 'Escribe VACIAR para confirmar. No se ha borrado nada.' };
  }

  const antes = await contarDatosDeEjemplo();

  const marca = await prisma.brand.findUnique({
    where: { slug: MARCA_DE_EJEMPLO },
    select: { id: true, name: true },
  });

  /* 1. Los guiones, que la marca NO se lleva. Sus escenas sí caen solas. */
  if (marca) {
    const guiones = await prisma.script.findMany({
      where: { brandId: marca.id },
      select: { id: true },
    });
    if (guiones.length) {
      await prisma.script.deleteMany({ where: { id: { in: guiones.map((g) => g.id) } } });
    }

    /* 2. Los eventos del calendario, por lo mismo. */
    await prisma.calendarEvent.deleteMany({ where: { brandId: marca.id } });

    /* 3. Los adjuntos de los videos, antes de que los videos desaparezcan. */
    const videos = await prisma.contentItem.findMany({
      where: { brandId: marca.id },
      select: { id: true },
    });
    for (const v of videos) await borrarAssetsDe("content", v.id);

    /* 4. La marca. Ahora sí: se lleva objetivos y videos en cascada. */
    await borrarAssetsDe("brand", marca.id);
    await prisma.brand.delete({ where: { id: marca.id } });
  }

  /* 5. Las cuentas ficticias. Nunca la de quien está ejecutando esto. */
  await prisma.user.deleteMany({
    where: { email: { in: CORREOS_DE_EJEMPLO }, id: { not: user.id } },
  });

  /* 6. Los perfiles genéricos, con sus adjuntos. */
  const genericos = await prisma.archetype.findMany({
    where: { isPerson: false },
    select: { id: true },
  });
  for (const g of genericos) await borrarAssetsDe("archetype", g.id);
  await prisma.archetype.deleteMany({ where: { isPerson: false } });

  await logAudit({
    user,
    action: "ELIMINAR",
    entity: "AppSetting",
    summary:
      `Vació los datos de ejemplo: ${antes.videos} videos, ${antes.guiones} guiones, ` +
      `${antes.metricas} métricas, ${antes.cuentas.length} cuentas y ` +
      `${antes.perfilesGenericos} perfiles genéricos`,
  });

  for (const ruta of [
    "/",
    "/marcas",
    "/contenido",
    "/guiones",
    "/calendario",
    "/metricas",
    "/equipo",
    "/arquetipos",
    "/ajustes",
    "/actividad",
  ]) {
    revalidatePath(ruta);
  }

  return {
    ok:
      `Listo. Se fueron ${antes.videos} videos, ${antes.guiones} guiones, ` +
      `${antes.metricas} métricas, ${antes.cuentas.length} cuentas y ` +
      `${antes.perfilesGenericos} perfiles genéricos. ` +
      `Tus ${antes.seConserva.personas} personas y tus ${antes.seConserva.estructuras} estructuras siguen ahí.`,
  };
}
