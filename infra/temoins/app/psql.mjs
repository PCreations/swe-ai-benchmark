// ─────────────────────────────────────────────────────────────────────────────
// infra/temoins/app/psql.mjs — le seul accès à PostgreSQL des témoins.
//
// POURQUOI `psql` ET PAS UN PILOTE. Le cahier §C fige les versions exactes et
// T00 a scellé `pnpm-lock.yaml` ; ajouter un pilote au verrou pour faire passer
// T09 déplacerait une décision de toolchain sous couvert d'implémentation. Le
// client en ligne de commande de PostgreSQL 18 est déjà un prérequis DÉCLARÉ de
// T09 (`requires: postgres18`) et sondé au boot. On s'en sert.
//
// UN APPEL = UNE TRANSACTION. `psql -c "<plusieurs instructions>"` envoie la
// chaîne entière comme UN message Query : PostgreSQL l'enveloppe alors dans une
// transaction implicite. Conséquences dont dépend T09.A2 :
//   • atomicité — une erreur au milieu annule tout ce qui précède ;
//   • `pg_advisory_xact_lock()` est tenu jusqu'à la fin de l'appel, donc deux
//     requêtes HTTP concurrentes sur le même créneau sont SÉRIALISÉES ;
//   • `CREATE TEMP TABLE … ON COMMIT DROP` est possible et se nettoie seul.
//
// LES PARAMÈTRES NE SONT JAMAIS CONCATÉNÉS DANS DU SQL. Ils sont sérialisés en
// JSON, encodés en base64 — un alphabet sans guillemet ni antislash, donc
// littéralement ininjectable — et redécodés côté serveur dans une table
// temporaire `_p`. Le corps PL/pgSQL, lui, est une constante du programme.
//
// LE RÉSULTAT PASSE PAR `_r`. Chaque opération écrit exactement une ligne
// `{ http, body }` dans `_r` ; le script se termine par un unique SELECT. La
// sortie de `psql -tAq` est donc UNE ligne de JSON, et rien d'autre.
// ─────────────────────────────────────────────────────────────────────────────
import { execFile } from 'node:child_process'

const TIMEOUT_MS = 60_000
const MAX_BUFFER = 64 * 1024 * 1024

/** Les appels `psql` en vol. `stop()` les attend avant de rendre la main, sans
 *  quoi une connexion orpheline empêcherait `CREATE DATABASE … TEMPLATE` (les
 *  clones jetables de F-RESERVATION P3). */
const EN_VOL = new Set()

export function appelsEnVol() {
  return EN_VOL.size
}

/** Exécute un script SQL et rend les lignes de sortie, sans les interpréter. */
export function psql(dsn, script) {
  return new Promise((resolve) => {
    const enfant = execFile(
      'psql',
      ['-tAqX', '-v', 'ON_ERROR_STOP=1', '-d', dsn, '-c', script],
      { encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER },
      (err, stdout, stderr) => {
        EN_VOL.delete(enfant)
        if (err) {
          resolve({
            ok: false,
            erreur: `${String(stderr ?? '')}${String(err.message ?? '')}`.trim(),
            lignes: [],
          })
          return
        }
        resolve({
          ok: true,
          erreur: '',
          lignes: String(stdout).split('\n').filter((l) => l.length > 0),
        })
      },
    )
    EN_VOL.add(enfant)
  })
}

/** Le préambule qui matérialise `_p` (paramètres) et `_r` (résultat). */
function preambule(params) {
  const b64 = Buffer.from(JSON.stringify(params ?? {}), 'utf8').toString('base64')
  return (
    `CREATE TEMP TABLE _p(j jsonb) ON COMMIT DROP;\n` +
    `INSERT INTO _p VALUES (convert_from(decode('${b64}','base64'),'UTF8')::jsonb);\n` +
    `CREATE TEMP TABLE _r(payload jsonb) ON COMMIT DROP;\n`
  )
}

/**
 * Exécute un corps PL/pgSQL d'opération métier et rend `{ http, body }`.
 * Le corps DOIT insérer exactement une ligne dans `_r`.
 */
export async function operation(dsn, corps, params) {
  const script = `${preambule(params)}DO $bench$\n${corps}\n$bench$;\nSELECT payload::text FROM _r;`
  const r = await psql(dsn, script)
  if (!r.ok) {
    return {
      http: 500,
      body: { ok: false, code: 'DB_ERROR', detail: r.erreur.split('\n').slice(0, 4).join(' | ') },
    }
  }
  if (r.lignes.length !== 1) {
    return {
      http: 500,
      body: { ok: false, code: 'DB_NO_RESULT', detail: `${String(r.lignes.length)} ligne(s) rendue(s)` },
    }
  }
  try {
    const v = JSON.parse(r.lignes[0])
    return { http: Number(v.http), body: v.body }
  } catch (e) {
    return { http: 500, body: { ok: false, code: 'DB_UNREADABLE', detail: String(e.message) } }
  }
}

/** Exécute du SQL de migration (DDL + reprises de données), sans résultat. */
export async function ddl(dsn, script) {
  const r = await psql(dsn, script)
  return { ok: r.ok, erreur: r.erreur }
}

/** Lit une valeur scalaire unique. */
export async function scalaire(dsn, requete) {
  const r = await psql(dsn, requete)
  if (!r.ok) return { ok: false, valeur: null, erreur: r.erreur }
  return { ok: true, valeur: r.lignes.length > 0 ? r.lignes[0] : null, erreur: '' }
}
