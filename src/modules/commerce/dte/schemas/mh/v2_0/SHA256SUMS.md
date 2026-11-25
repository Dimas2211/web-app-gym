# Schemas oficiales MH 2.0 — copia literal (IMP20-001)

Copia byte a byte de `docs/fiscal/mh-normativa-2.0/originales/svfe-json-schemas/`.
**No editar.** Cualquier cambio debe venir de una nueva publicación oficial de MH,
copiada sin modificaciones, con este archivo actualizado.
El test `spec/mh20-spec.test.ts` verifica estos hashes y la igualdad con el original.

| Archivo | Origen | SHA-256 |
|---|---|---|
| fe-f-v2.json | v2/fe-f-v2.json | 2887ff3ccf5594eb1f49dcec1ce8bba134a86462f900069de1365d18ff997aff |
| fe-ccf-v4.json | v4/fe-ccf-v4.json | 2c2db8b3f6144bdd0d128ec2babecd38f277f8493458a06cf1b2be7b816fba32 |
| fe-nc-v4.json | v4/fe-nc-v4.json | f663902030a9ef28ddb8cef7d1e93fa286c1852465175e25d524e3fedb5419d2 |
| fe-fse-v2.json | v2/fe-fse-v2.json | 21b20ae93f85795db3731ee853504edca9998f7f340defd0b6745659840bc75d |
| invalidacion-schema-v3.json | v3/invalidacion-schema-v3.json | 1ce117cb01b59da309dcbb237cc011e0c4539b3effe9cdd3c2b7794ea631693a |
| contingencia-schema-v4.json | v4/contingencia-schema-v4.json | 03fc357397dc7aaa4a8b44f887497dd1ead3a04eb71ec043bb2c0cda485bb149 |
| fe-eret-v1.json | v1/fe-eret-v1.json | b845e98ca8acaa4e5829acdc36cb046d97ec87e71c823252895bdf907fdafb35 |
| fe-eop-v1.json | v1/fe-eop-v1.json | 16c494520e5c75d6d51b86cc081db758913414570134129995e4213e64c859c6 |

FEX v3 (`v3/fe-fex-v3.json`, SHA-256 `9539e63b4aa80272a835e1e5e28435b466f17ef1ff8c768f81be156844d57977`)
es idéntico a `../fex-11-v3.schema.json` (perfil MH_1_2); no se duplica.

Invalidación v3, contingencia v4, retención (17) y operaciones (18) están
registrados pero **bloqueados** para generación (IMP20-018/019, MT-GAP-001).
