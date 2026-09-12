// ─────────────────────────────────────────────────────────────────────────────
// infra/temoins/app/migrations.mjs — les QUATRE VERSIONS de l'API de
// réservation, et les migrations connues qui mènent de l'une à la suivante.
//
// CE QUE « MIGRATION CONNUE » VEUT DIRE ICI. Cahier L231 : « les migrations
// portent sur les données RÉELLEMENT CRÉÉES aux périodes précédentes ». Chaque
// palier ci-dessous change donc le SCHÉMA *et* reprend les lignes déjà
// présentes — il n'y a pas de retour à une base idéale (invariant D-1).
// Démarrer la version k sur une base restée en version j < k applique, dans
// l'ordre, les paliers j+1 … k. C'est le seul mécanisme de migration du témoin.
//
//   v1  Le noyau : créneaux à capacité, réservations, déduplication par clé
//       d'opération (invariant D-6). Au-delà de la capacité : REFUS métier.
//   v2  La file d'attente : une demande au-delà de la capacité est ADMISE en
//       attente, et l'annulation d'une réservation confirmée promeut la
//       première en attente. L'ordre est la SÉQUENCE D'ADMISSION EXPLICITE
//       portée par la demande, jamais l'horodatage (cahier L123).
//   v3  Le délai d'annulation : au moins 24 h avant le début, frontière
//       INCLUSE (cahier L119). La date limite est une colonne, REPRISE sur les
//       créneaux déclarés en v1/v2 — c'est une migration de données, pas un
//       simple calcul à la volée.
//   v4  Le multi-locataire : les données existantes sont RATTACHÉES à `legacy`,
//       le locataire `other` est créé, et la clé des créneaux devient
//       (locataire, créneau). Les acteurs d'un locataire ne voient ni ne
//       modifient les réservations d'un autre : `NOT_FOUND` (cahier L123).
//
// AVANT v4, LE CHAMP `tenant` DES DEMANDES N'EST PAS STOCKÉ. C'est exactement
// ce que dit §F : le locataire `legacy` n'existe comme entité qu'en P4, où les
// données « existantes » y sont migrées. Le faire exister plus tôt viderait la
// migration de P4 de son objet.
// ─────────────────────────────────────────────────────────────────────────────
import { ddl, scalaire } from './psql.mjs'

export const VERSION_MAX = 4

/** Le socle : la table de version, présente avant tout palier. */
const SOCLE = `
CREATE TABLE IF NOT EXISTS bench_meta(
  k text PRIMARY KEY,
  v text NOT NULL
);`

/**
 * Les paliers. `PALIERS[k]` mène de la version k-1 à la version k ; il est
 * exécuté dans la transaction implicite d'un seul appel psql, donc tout ou rien.
 */
const PALIERS = {
  1: `
CREATE SEQUENCE reservation_ids;

CREATE TABLE slots(
  slot_key   text        NOT NULL,
  capacity   integer     NOT NULL CHECK (capacity >= 0),
  starts_at  timestamptz NOT NULL,
  CONSTRAINT slots_pk PRIMARY KEY (slot_key)
);

CREATE TABLE reservations(
  reservation_id     text        NOT NULL,
  actor              text        NOT NULL,
  slot_key           text        NOT NULL,
  status             text        NOT NULL,
  admission_sequence bigint      NOT NULL,
  requested_at       timestamptz NOT NULL,
  CONSTRAINT reservations_pk PRIMARY KEY (reservation_id),
  CONSTRAINT reservations_slot_fk FOREIGN KEY (slot_key) REFERENCES slots(slot_key),
  CONSTRAINT reservations_status_ck CHECK (status IN ('confirmed','cancelled'))
);

-- Invariant D-6 : « les effets validés sont dédupliqués par clé d'opération et
-- empreinte d'entrée ». La réponse rendue est conservée telle quelle : un rejeu
-- de la MÊME clé avec les MÊMES arguments renvoie la MÊME réponse, sans second
-- effet. Une clé rejouée avec des arguments DIFFÉRENTS est un refus métier.
CREATE TABLE operations(
  idempotency_key text    NOT NULL,
  operation       text    NOT NULL,
  input_digest    text    NOT NULL,
  http_status     integer NOT NULL,
  response        jsonb   NOT NULL,
  CONSTRAINT operations_pk PRIMARY KEY (idempotency_key)
);
`,

  2: `
ALTER TABLE reservations DROP CONSTRAINT reservations_status_ck;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_ck
  CHECK (status IN ('confirmed','waiting','cancelled'));
ALTER TABLE reservations ADD COLUMN promoted_at timestamptz;
`,

  3: `
ALTER TABLE slots ADD COLUMN cancellation_deadline timestamptz;
-- REPRISE des créneaux réellement déclarés en P1/P2 (cahier L231).
UPDATE slots SET cancellation_deadline = starts_at - interval '24 hours';
ALTER TABLE slots ALTER COLUMN cancellation_deadline SET NOT NULL;
`,

  4: `
CREATE TABLE tenants(
  tenant text NOT NULL,
  CONSTRAINT tenants_pk PRIMARY KEY (tenant)
);
INSERT INTO tenants(tenant) VALUES ('legacy'), ('other');

ALTER TABLE slots ADD COLUMN tenant text;
-- REPRISE : les creneaux existants sont RATTACHES au locataire legacy (cahier L119).
UPDATE slots SET tenant = 'legacy';
ALTER TABLE slots ALTER COLUMN tenant SET NOT NULL;

ALTER TABLE reservations ADD COLUMN tenant text;
-- REPRISE : les reservations existantes sont RATTACHEES au locataire legacy. C'est
-- l'assertion que T09.A3 mesure sur 100 lignes créées en P1, P2 et P3.
UPDATE reservations SET tenant = 'legacy';
ALTER TABLE reservations ALTER COLUMN tenant SET NOT NULL;

-- La clé d'un créneau devient (locataire, créneau) : deux locataires peuvent
-- porter le même nom de créneau sans se voir.
ALTER TABLE reservations DROP CONSTRAINT reservations_slot_fk;
ALTER TABLE slots DROP CONSTRAINT slots_pk;
ALTER TABLE slots ADD CONSTRAINT slots_pk PRIMARY KEY (tenant, slot_key);
ALTER TABLE slots ADD CONSTRAINT slots_tenant_fk FOREIGN KEY (tenant) REFERENCES tenants(tenant);
ALTER TABLE reservations ADD CONSTRAINT reservations_slot_fk
  FOREIGN KEY (tenant, slot_key) REFERENCES slots(tenant, slot_key);
ALTER TABLE reservations ADD CONSTRAINT reservations_tenant_fk
  FOREIGN KEY (tenant) REFERENCES tenants(tenant);
`,
}

/** La version de schéma actuellement matérialisée dans la base. */
export async function versionCourante(dsn) {
  const socle = await ddl(dsn, SOCLE)
  if (!socle.ok) return { ok: false, version: 0, erreur: socle.erreur }
  const r = await scalaire(dsn, `SELECT coalesce((SELECT v FROM bench_meta WHERE k = 'schema_version'), '0');`)
  if (!r.ok) return { ok: false, version: 0, erreur: r.erreur }
  return { ok: true, version: Number(r.valeur ?? '0'), erreur: '' }
}

/**
 * Amène la base à la version demandée. Chaque palier est un appel psql, donc
 * une transaction : un palier qui échoue ne laisse pas de schéma à moitié migré.
 * Une version DEMANDÉE INFÉRIEURE à la version matérialisée est un REFUS et non
 * un silence : rétrograder un schéma sans rétrograder les données servirait un
 * état métier que personne n'a produit.
 */
export async function migrer(dsn, cible) {
  const courante = await versionCourante(dsn)
  if (!courante.ok) return { ok: false, de: 0, a: 0, paliers: [], erreur: courante.erreur }
  if (cible < courante.version) {
    return {
      ok: false,
      de: courante.version,
      a: cible,
      paliers: [],
      erreur:
        `RETROGRADATION-REFUSEE : la base porte le schema v${String(courante.version)}, ` +
        `version demandee v${String(cible)}`,
    }
  }
  const appliques = []
  for (let k = courante.version + 1; k <= cible; k += 1) {
    const palier = PALIERS[k]
    if (palier === undefined) {
      return { ok: false, de: courante.version, a: k - 1, paliers: appliques, erreur: `PALIER-INCONNU v${String(k)}` }
    }
    const script =
      `${palier}\nINSERT INTO bench_meta(k, v) VALUES ('schema_version', '${String(k)}')\n` +
      `  ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v;`
    const r = await ddl(dsn, script)
    if (!r.ok) {
      return { ok: false, de: courante.version, a: k - 1, paliers: appliques, erreur: `PALIER-${String(k)} ${r.erreur}` }
    }
    appliques.push(k)
  }
  return { ok: true, de: courante.version, a: cible, paliers: appliques, erreur: '' }
}
