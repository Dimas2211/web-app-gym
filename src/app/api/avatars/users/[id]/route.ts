// ─────────────────────────────────────────────────────────────────
// api/avatars/users/[id]/route.ts
//
// GET  — imagen del avatar privado del User (staff) (autorizada por tenant/scope)
// POST — sube/reemplaza el avatar (multipart: file). El servidor decide
//        tenant, object key, bucket y avatar_url. Ver
//        modules/users/avatar-service.ts.
// ─────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { readUserAvatar, uploadUserAvatar } from "@/modules/users/avatar-service";
import {
  getRouteSessionUser,
  unauthenticated,
  uploadResponse,
  imageResponse,
  readUploadedFile,
} from "../../avatar-route";

type Params = { params: Promise<{ id: string }> };

// La versión del query (?v=) solo sirve para invalidar caché del navegador:
// NO se pasa al servicio. Se sirve siempre la versión activa persistida.
export async function GET(_req: NextRequest, { params }: Params) {
  const sessionUser = await getRouteSessionUser();
  if (!sessionUser) return unauthenticated();
  const { id } = await params;
  return imageResponse(await readUserAvatar(sessionUser, id));
}

export async function POST(req: NextRequest, { params }: Params) {
  const sessionUser = await getRouteSessionUser();
  if (!sessionUser) return unauthenticated();
  const { id } = await params;
  // El archivo se lee aquí pero se procesa recién DESPUÉS de autorizar
  // (uploadUserAvatar valida contexto/ownership antes de tocarlo).
  const file = await readUploadedFile(req);
  return uploadResponse(await uploadUserAvatar(sessionUser, id, file));
}
