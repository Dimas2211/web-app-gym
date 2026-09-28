# CAT-013 Municipio — procedencia

`cat-013-municipios-v1.2.csv` es una **transcripción normalizada del catálogo oficial del Ministerio de Hacienda**. Zolvi no lo inventó.

- **Fuente:** Ministerio de Hacienda de El Salvador. Catálogos - Sistema de Transmisión.
- **Versión:** 1.2
- **Fecha:** 10/2025
- **Catálogo:** CAT-013 Municipio

## Contenido

El archivo trae los 44 municipios nacionales de la organización territorial nueva, con estas columnas:

- `dept_code`: CAT-012.
- `code`: CAT-013.
- `name`: nombre en mayúsculas y sin tildes, salvo `Ñ`.

El código CAT-013 **se repite entre departamentos**. Por ejemplo, `05/28` es LA LIBERTAD SUR y `13/28` es MORAZAN SUR. Para identificar un municipio hacen falta el departamento y el nombre juntos.

El catálogo oficial también incluye `00 = Otro (Para extranjeros)`. Esta transcripción lo **excluye a propósito**, porque solo se usa para resolver direcciones nacionales del emisor.

## Uso en runtime

Este CSV es la fuente documental versionada. En runtime se usa la constante `src/modules/commerce/dte/utils/cat013-fex-v3-municipalities.ts`, que es **dependencia privada de FEX 11 v3** y solo la consume `projectFexV3Territory` (`fex11-v3-territory.ts`).

No reemplaza `Municipality.code`, `new_municipality_code` ni `resolveDteMunicipality()`. FE 01, CCFE 03, NC 05 y FSE 14 no lo usan.

## Por qué existe

MH TEST rechazó FEX v3 con `emisor.direccion.municipio` = `Municipality.code` ("11") y con el sufijo de `new_municipality_code` ("06"). En ambos casos el código fue 096, "municipio no cumple el formato requerido". FEX v3 exige el código CAT-013. Para Santa Tecla la dirección correcta es `05 / 28 / 11`.
