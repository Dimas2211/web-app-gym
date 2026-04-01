/**
 * POST /api/upload
 *
 * Sube un avatar (imagen) para un usuario o cliente.
 * Requiere sesión activa. Devuelve la URL pública del archivo.
 *
 * Body (multipart/form-data):
 *   file      — archivo de imagen
 *   entity_id — ID del usuario o cliente (se usa para nombrar el archivo)
 *
 * Respuesta:
 *   { url: string }   — en caso de éxito
 *   { error: string } — en caso de error
 *
 * LIMITACIÓN DE PRODUCCIÓN:
 *   En Vercel el filesystem es de solo lectura. Para producción debes
 *   cambiar `uploadAvatarFile` en src/lib/storage/index.ts para usar
 *   Supabase Storage, Vercel Blob u otro servicio cloud.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { uploadAvatarFile } from "@/lib/storage";

export async function POST(req: NextRequest) {
  // Verificar sesión
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formato de solicitud inválido." }, { status: 400 });
  }

  const file = formData.get("file");
  const entityId = formData.get("entity_id");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  }
  if (!entityId || typeof entityId !== "string") {
    return NextResponse.json({ error: "entity_id requerido." }, { status: 400 });
  }

  const result = await uploadAvatarFile(file, entityId);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ url: result.url });
}
