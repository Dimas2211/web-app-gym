# AGENTS.md — Sistema GYM / Plataforma modular

## Rol de Codex en este proyecto

Codex se usará como agente auxiliar para bugs puntuales cuando Claude Code no esté disponible.

No debe rediseñar arquitectura.
No debe cambiar decisiones cerradas.
No debe implementar módulos grandes sin autorización.
No debe tocar Prisma ni migraciones salvo que el prompt lo pida explícitamente.

## Contexto técnico

Proyecto: plataforma base multiindustria derivada del sistema GYM.

Stack:
- Next.js 15 App Router
- TypeScript
- Prisma
- PostgreSQL / Supabase
- Auth.js v5
- Tailwind CSS

Identidad transversal activa:
- tenant_id
- location_id

No volver a usar gym_id / branch_id como contrato principal.

## Reglas críticas

1. Trabajar por cambios pequeños y auditables.
2. Antes de editar, identificar causa raíz.
3. No rediseñar UI si el bug es funcional.
4. No tocar módulos fuera del alcance indicado.
5. No tocar ventas, compras, inventario, productos o auth salvo que el prompt lo pida.
6. No modificar schema.prisma ni crear migraciones sin permiso explícito.
7. No borrar lógica existente si puede corregirse localmente.
8. Después del cambio, listar archivos modificados.
9. Explicar causa raíz, solución aplicada y pruebas recomendadas.
10. Preferir cambios mínimos de alta confianza.

## Comandos de validación sugeridos

Usar solo cuando aplique:

```bash
npm run build
npx tsc --noEmit
npx prisma validate
npx prisma generate