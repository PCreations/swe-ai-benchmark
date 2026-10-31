// acceptance/fixtures/f-platform-calibration/source-mise-en-oeuvre-alteree.mjs — zone ACCEPTANCE (T77).
//
// SOURCE DONT SEULE LA MISE EN OEUVRE CHANGE : P6.R2 garde son texte, son contrat et ses bornes,
// mais sa mise en oeuvre dans le modele attendu ne refuse plus aucun groupe (chaque etape de
// decision rend `undefined`, « continuer »). Le modele attendu n'est donc plus le meme : une
// calibration de la source en vigueur ne vaut pas pour celle-ci, leurs empreintes different
// (T77.A1, II.3 de acceptance/T77.spec.ts).
import { sourceAlteree } from './source-commune.mjs'

function neutraliser(v) {
  if (typeof v === 'function') return () => undefined
  if (v !== null && typeof v === 'object' && typeof v.etape === 'function') return { ...v, etape: () => undefined }
  return v
}

export const clauses = sourceAlteree('P6.R2', (c) => ({
  ...c,
  implementation: Object.fromEntries(Object.entries(c.implementation ?? {}).map(([k, v]) => [k, neutraliser(v)])),
}))
export default clauses
