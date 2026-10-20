-- SUPABASE-PUBLIC-API-HARDENING (2026-10-06)
--
-- Cierra la puerta alternativa de la Supabase Data API (PostgREST/GraphQL)
-- sobre el schema `public`. Zolvi accede a sus datos SOLO server-side vía
-- Prisma (Runtime Database Router); los roles `anon`/`authenticated` no tienen
-- ningún uso legítimo en este producto. Ver
-- docs/modules/supabase-public-api-hardening.md.
--
-- Propiedad objetivo (equivalente al Control Plane):
--   SET ROLE anon / authenticated → "permission denied for schema public".
--
-- Portabilidad / fail-safe:
-- - PostgreSQL sin roles Supabase (`anon`/`authenticated` inexistentes):
--   NOT_APPLICABLE → no cambia nada (local queda intacto).
-- - Supabase: todo ocurre en UN solo bloque DO (atómico). Si al final
--   anon/authenticated conservan USAGE/CREATE sobre `public`, se aborta con
--   EXCEPTION y no queda ningún cambio parcial.
-- - Idempotente: re-ejecutarlo sobre una base ya endurecida no cambia nada.
-- - No toca `service_role`, ni schemas de Supabase (auth, storage, graphql,
--   realtime, extensions), ni RLS, ni datos.
-- - Las default ACLs de roles que el migrador no puede administrar (p.ej.
--   `supabase_admin`) se omiten con NOTICE: quedan neutralizadas porque
--   anon/authenticated ya no pueden usar el schema `public`.

DO $hardening$
DECLARE
  v_api_roles     text[];
  v_role_list     text;
  v_schema_oid    oid;
  v_schema_owner  oid;
  v_rec           record;
  v_obj_kind      text;
  v_api_role      text;
BEGIN
  SELECT array_agg(r.rolname::text ORDER BY r.rolname)
    INTO v_api_roles
    FROM pg_catalog.pg_roles r
   WHERE r.rolname IN ('anon', 'authenticated');

  IF v_api_roles IS NULL THEN
    RAISE NOTICE 'supabase-public-api-hardening: NOT_APPLICABLE (no existen los roles anon/authenticated)';
    RETURN;
  END IF;

  SELECT n.oid, n.nspowner
    INTO v_schema_oid, v_schema_owner
    FROM pg_catalog.pg_namespace n
   WHERE n.nspname = 'public';

  IF v_schema_oid IS NULL THEN
    RAISE NOTICE 'supabase-public-api-hardening: NOT_APPLICABLE (no existe el schema public)';
    RETURN;
  END IF;

  SELECT string_agg(quote_ident(r), ', ') INTO v_role_list FROM unnest(v_api_roles) AS r;

  -- 1. Preservar USAGE explícito para los roles no-API que hoy usan `public`
  --    (migrador, owners de objetos, grantees de tablas) y que HOY lo tienen
  --    solo a través de PUBLIC (o de anon/authenticated). Así revocar PUBLIC
  --    no deja a nadie legítimo afuera, y nunca se concede USAGE a un rol que
  --    no lo tenía (sin escalamiento).
  FOR v_rec IN
    SELECT ro.rolname::text AS rolname
      FROM pg_catalog.pg_roles ro
     WHERE ro.rolname <> ALL (v_api_roles)
       AND NOT ro.rolsuper
       AND has_schema_privilege(ro.oid, v_schema_oid, 'USAGE')
       AND NOT pg_catalog.pg_has_role(ro.oid, v_schema_owner, 'USAGE')
       AND (
             ro.rolname = current_user
          OR ro.oid IN (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.relnamespace = v_schema_oid)
          OR ro.oid IN (
               SELECT a.grantee
                 FROM pg_catalog.pg_class c
                 CROSS JOIN LATERAL aclexplode(c.relacl) a
                WHERE c.relnamespace = v_schema_oid
                  AND a.grantee <> 0
             )
           )
       AND NOT EXISTS (
             SELECT 1
               FROM pg_catalog.pg_namespace n
               CROSS JOIN LATERAL aclexplode(n.nspacl) a
              WHERE n.oid = v_schema_oid
                AND a.grantee <> 0
                AND a.grantee NOT IN (SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = ANY (v_api_roles))
                AND a.privilege_type = 'USAGE'
                AND pg_catalog.pg_has_role(ro.oid, a.grantee, 'USAGE')
           )
  LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', v_rec.rolname);
    RAISE NOTICE 'supabase-public-api-hardening: USAGE explícito preservado para %', v_rec.rolname;
  END LOOP;

  -- 2. Revocar privilegios de anon/authenticated sobre objetos de `public`
  --    que el migrador administra (owner o miembro del owner). Solo objetos
  --    cuyo ACL (de tabla o de columna) realmente los menciona → idempotente
  --    y mínimo. REVOKE a nivel de tabla también revoca los de columna.
  FOR v_rec IN
    SELECT c.relname::text AS objname, c.relkind, pg_catalog.pg_has_role(current_user, c.relowner, 'USAGE') AS manageable
      FROM pg_catalog.pg_class c
     WHERE c.relnamespace = v_schema_oid
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
       AND (
             EXISTS (
               SELECT 1
                 FROM aclexplode(c.relacl) a
                 JOIN pg_catalog.pg_roles ar ON ar.oid = a.grantee
                WHERE ar.rolname = ANY (v_api_roles)
             )
          OR EXISTS (
               SELECT 1
                 FROM pg_catalog.pg_attribute att
                 CROSS JOIN LATERAL aclexplode(att.attacl) a
                 JOIN pg_catalog.pg_roles ar ON ar.oid = a.grantee
                WHERE att.attrelid = c.oid
                  AND ar.rolname = ANY (v_api_roles)
             )
           )
  LOOP
    v_obj_kind := CASE WHEN v_rec.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END;
    IF v_rec.manageable THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON %s public.%I FROM %s', v_obj_kind, v_rec.objname, v_role_list);
    ELSE
      RAISE NOTICE 'supabase-public-api-hardening: % public.% no pertenece al migrador; grants residuales neutralizados por la revocación del schema', v_obj_kind, v_rec.objname;
    END IF;
  END LOOP;

  FOR v_rec IN
    SELECT p.proname::text AS objname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
           p.prokind,
           pg_catalog.pg_has_role(current_user, p.proowner, 'USAGE') AS manageable
      FROM pg_catalog.pg_proc p
     WHERE p.pronamespace = v_schema_oid
       AND EXISTS (
             SELECT 1
               FROM aclexplode(p.proacl) a
               JOIN pg_catalog.pg_roles ar ON ar.oid = a.grantee
              WHERE ar.rolname = ANY (v_api_roles)
           )
  LOOP
    v_obj_kind := CASE WHEN v_rec.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END;
    IF v_rec.manageable THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON %s public.%I(%s) FROM %s', v_obj_kind, v_rec.objname, v_rec.args, v_role_list);
    ELSE
      RAISE NOTICE 'supabase-public-api-hardening: % public.% no pertenece al migrador; grants residuales neutralizados por la revocación del schema', v_obj_kind, v_rec.objname;
    END IF;
  END LOOP;

  -- 3. Cerrar el schema: anon/authenticated (directo) y PUBLIC (heredado).
  --    Revocar solo a anon/authenticated NO basta: ambos heredan de PUBLIC.
  EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA public FROM %s', v_role_list);
  REVOKE ALL PRIVILEGES ON SCHEMA public FROM PUBLIC;

  -- 4. Default privileges: evitar que tablas/secuencias/funciones FUTURAS
  --    vuelvan a otorgarse a anon/authenticated. Solo entradas de `public` o
  --    globales, y solo de roles que el migrador puede administrar.
  FOR v_rec IN
    SELECT pg_catalog.pg_get_userbyid(d.defaclrole)::text AS owner_name,
           d.defaclnamespace,
           d.defaclobjtype,
           pg_catalog.pg_has_role(current_user, d.defaclrole, 'MEMBER') AS manageable
      FROM pg_catalog.pg_default_acl d
     WHERE (d.defaclnamespace = v_schema_oid OR d.defaclnamespace = 0)
       AND d.defaclobjtype IN ('r', 'S', 'f')
       AND EXISTS (
             SELECT 1
               FROM aclexplode(d.defaclacl) a
               JOIN pg_catalog.pg_roles ar ON ar.oid = a.grantee
              WHERE ar.rolname = ANY (v_api_roles)
           )
  LOOP
    v_obj_kind := CASE v_rec.defaclobjtype WHEN 'r' THEN 'TABLES' WHEN 'S' THEN 'SEQUENCES' ELSE 'FUNCTIONS' END;
    IF v_rec.manageable THEN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I %s REVOKE ALL PRIVILEGES ON %s FROM %s',
        v_rec.owner_name,
        CASE WHEN v_rec.defaclnamespace = 0 THEN '' ELSE 'IN SCHEMA public' END,
        v_obj_kind,
        v_role_list
      );
    ELSE
      RAISE NOTICE 'supabase-public-api-hardening: default privileges de % (%) no administrables por %; neutralizados por la revocación del schema', v_rec.owner_name, v_obj_kind, current_user;
    END IF;
  END LOOP;

  -- 5. Verificación fail-closed: si el migrador no pudo cerrar el schema,
  --    abortar todo el bloque (rollback completo, sin cambios parciales).
  FOREACH v_api_role IN ARRAY v_api_roles LOOP
    IF has_schema_privilege(v_api_role, 'public', 'USAGE')
       OR has_schema_privilege(v_api_role, 'public', 'CREATE') THEN
      RAISE EXCEPTION 'supabase-public-api-hardening: % conserva acceso al schema public (current_user=% sin privilegios suficientes). Abortado sin cambios.', v_api_role, current_user;
    END IF;
  END LOOP;

  IF EXISTS (
       SELECT 1
         FROM pg_catalog.pg_default_acl d
         CROSS JOIN LATERAL aclexplode(d.defaclacl) a
         JOIN pg_catalog.pg_roles ar ON ar.oid = a.grantee
        WHERE d.defaclrole = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
          AND (d.defaclnamespace = v_schema_oid OR d.defaclnamespace = 0)
          AND d.defaclobjtype IN ('r', 'S', 'f')
          AND ar.rolname = ANY (v_api_roles)
     ) THEN
    RAISE EXCEPTION 'supabase-public-api-hardening: default privileges de % siguen otorgando acceso a anon/authenticated. Abortado sin cambios.', current_user;
  END IF;

  RAISE NOTICE 'supabase-public-api-hardening: APPLIED (roles: %, migrador: %)', v_role_list, current_user;
END
$hardening$;
