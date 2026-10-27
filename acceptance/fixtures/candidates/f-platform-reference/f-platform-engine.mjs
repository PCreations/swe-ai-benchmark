// GENERE par acceptance/fixtures/candidates/f-platform-reference/generer.mjs depuis packages/oracle/src/f-platform-engine.ts au commit 3e8b66495034f24cfe41cb50e85764e4c9a0cafb. NE PAS EDITER.
// ─────────────────────────────────────────────────────────────────────────────
// @bench/oracle — moteur d'exécution des clauses de F-PLATFORM (tâche T70,
// ADR-021 décision 1).
//
// CE FICHIER NE CONTIENT AUCUNE RÈGLE MÉTIER. Il sait seulement :
//   - quelles clauses sont actives à une période ([entrée, sortie[) ;
//   - à quelle clause active appartient une décision (clé de sa mise en œuvre) ;
//   - dérouler une opération : étapes d'enveloppe, puis étapes de l'opération
//     triées par rang, puis son effet ; chaque étape, chaque effet, chaque vue
//     est une fonction portée par une clause de f-platform-clauses.ts.
//
// Une décision demandée qui n'a pas de clause active lève une erreur : rien ne
// se décide ici « par défaut », hormis deux points de structure documentés
// (locataire implicite avant P3, une place par réservation avant P6).
//
// L'instant et le rang de confirmation d'une réservation ne sont PAS posés par
// le moteur : `confirmer` passe la main à la décision `reservation.confirmation`
// (clause P1.R3), qui les inscrit (clarification N-03).
//
// Deux facilités de STRUCTURE, sans règle (T71) :
//   - journal financier brut du locataire (`journaliser`) : les clauses qui
//     font circuler de l'argent y inscrivent ce qu'elles font ; ce que ce
//     journal VAUT (lignes de facture, avoirs, mois) est décidé par les clauses
//     de P14 ;
//   - `donnees` : un entrepôt clé -> valeur par locataire où chaque clause
//     range son propre état (fuseau, absences, taux, factures...), et un
//     entrepôt global (`donneeGlobale`) pour l'état d'une clause qui traverse
//     les locataires (rang de confirmation, P1.R3).
//
// Aucune horloge ambiante : l'instant de chaque opération est son champ `at`.
//
// Quatre facilités de MÉCANIQUE, sans règle (T72) :
//   - phase de requête (`requete.*`, étapes rangées) : avant tout le reste,
//     une clause peut refuser la requête, ou la réécrire (step et args sont
//     modifiables) et inscrire une transformation de la réponse (`sorties`),
//     appliquée en tout dernier ;
//   - compléments (`<op>.complement.*`) : fonctions rangées appliquées à la
//     réponse de l'opération, avant la mémorisation (`apres`) ;
//   - invariants (`invariant.*`) : vérifications exécutées après chaque
//     opération ; elles lèvent si l'état les viole ;
//   - sous-opération (`ctx.executer(op, args)`) : déroule une opération du même
//     acteur, au même instant, dans le même locataire (enveloppe, étapes,
//     effet, compléments, mémorisation, invariants), pour une clause qui en
//     enchaîne plusieurs.
// ─────────────────────────────────────────────────────────────────────────────
export function periodNumber(v) {
    if (typeof v === 'number' && Number.isInteger(v))
        return v;
    if (typeof v === 'string') {
        const m = /^[Pp]?(\d{1,2})$/.exec(v.trim());
        if (m)
            return Number(m[1]);
    }
    return null;
}
export function isActiveAt(c, n) {
    const e = periodNumber(c.enters);
    if (e === null)
        return false;
    const s = c.exits === null || c.exits === undefined ? null : periodNumber(c.exits);
    return e <= n && (s === null || n < s);
}
export function fail(error) {
    return { ok: false, error };
}
export function succeed(champs) {
    return { ok: true, ...champs };
}
export function clone(v) {
    return JSON.parse(JSON.stringify(v));
}
export function newTenant(tenant_id, owner_id) {
    return {
        tenant_id,
        ...(owner_id === undefined ? {} : { owner_id }),
        slots: new Map(),
        bookings: new Map(),
        memo: new Map(),
        members: new Map(),
        tiers: new Map(),
        wallets: new Map(),
        series: new Map(),
        journal: [],
        donnees: new Map(),
    };
}
/** Table des décisions actives à une période : décision -> [clause, mise en œuvre]. */
function decisionTable(clauses, n) {
    const table = new Map();
    for (const c of clauses) {
        if (!isActiveAt(c, n))
            continue;
        for (const [decision, impl] of Object.entries(c.implementation)) {
            const deja = table.get(decision);
            if (deja !== undefined) {
                throw new Error(`CONTRADICTION decision ${decision} gouvernee par ${deja[0]} et ${c.id} a P${String(n)}`);
            }
            table.set(decision, [c.id, impl]);
        }
    }
    return table;
}
export class PlatformContext {
    etat;
    periode;
    table;
    /** Locataire courant (partition de l'état) ; fixé par l'enveloppe. */
    locataire;
    /** Données de travail de l'opération (créneau, réservation, places...). */
    d = {};
    /** Rappels exécutés sur la réponse finale (mémorisation d'idempotence). */
    apres = [];
    /** Transformations de la réponse, appliquées en dernier, dans l'ordre d'inscription. */
    sorties = [];
    /** Requête courante : une clause de la phase `requete.` peut la réécrire. */
    step;
    args;
    constructor(etat, step, periode, table) {
        this.etat = etat;
        this.periode = periode;
        this.table = table;
        this.step = step;
        this.args = step.args ?? {};
        this.locataire = etat.tenants.get('default');
    }
    /** Réécrit la requête courante (op et args), pour la suite de l'opération. */
    reecrire(op, args) {
        this.step = { ...this.step, op, args };
        this.args = args;
    }
    /** Sous-opération : `op` avec `args`, même acteur, même instant, même locataire. */
    executer(op, args) {
        const sous = new PlatformContext(this.etat, { ...this.step, op, args }, this.periode, this.table);
        return derouler(sous);
    }
    get instant() {
        return Date.parse(this.step.at);
    }
    regleOpt(decision) {
        return this.table.get(decision)?.[1];
    }
    regle(decision) {
        const r = this.table.get(decision);
        if (r === undefined) {
            throw new Error(`DECISION-SANS-CLAUSE ${decision} a P${String(this.periode)} (operation ${this.step.op})`);
        }
        return r[1];
    }
    /** Toutes les décisions actives d'un préfixe, dans l'ordre de leur rang puis de leur nom. */
    regles(prefixe) {
        const trouvees = [];
        for (const [k, v] of this.table)
            if (k.startsWith(prefixe))
                trouvees.push([k, v[1]]);
        const rang = (v) => v !== null && typeof v === 'object' && typeof v.rang === 'number'
            ? v.rang
            : 0;
        trouvees.sort((a, b) => rang(a[1]) - rang(b[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        return trouvees.map(([, v]) => v);
    }
    /* ─────────────── points d'appel communs, chacun servi par une clause ── */
    role(member) {
        if (typeof member !== 'string')
            return undefined;
        return this.regle('membres.role')(this, this.locataire, member);
    }
    occupees(slot) {
        return this.regle('creneau.occupation')(this, slot);
    }
    estActive(b) {
        return this.regles('reservation.active.').some((f) => f(b));
    }
    /** Inscrit un mouvement au journal financier brut du locataire courant, daté par `at`. */
    journaliser(e) {
        const entree = { seq: ++this.etat.journal_seq, at: this.step.at, ...e };
        this.locataire.journal.push(entree);
        return entree;
    }
    /** L'état qu'une clause range sous `cle` dans le locataire courant (créé par `init` au premier accès). */
    donnee(cle, init) {
        const d = this.locataire.donnees;
        if (!d.has(cle))
            d.set(cle, init());
        return d.get(cle);
    }
    /** L'état global qu'une clause range sous `cle` (créé par `init` au premier accès). */
    donneeGlobale(cle, init) {
        const d = this.etat.donnees;
        if (!d.has(cle))
            d.set(cle, init());
        return d.get(cle);
    }
    /** Une réservation devient confirmed (clause `reservation.confirmation`), puis montant et paiement si des clauses actives les gouvernent. */
    confirmer(b) {
        this.regle('reservation.confirmation')(this, b);
        const montant = this.regleOpt('reservation.montant');
        if (montant !== undefined)
            b.amount_cents = montant(this, b);
        const paiement = this.regleOpt('reservation.paiement');
        if (paiement !== undefined)
            paiement(this, b);
    }
    /** Des places du créneau viennent d'être libérées : promotion, si une clause active la gouverne. */
    liberer(slot) {
        if (slot === undefined)
            return [];
        const promotion = this.regleOpt('liberation.promotion');
        return promotion === undefined ? [] : promotion(this, slot);
    }
    vue(prefixe, objet) {
        const champs = {};
        for (const v of this.regles(prefixe))
            v(this, objet, champs);
        return succeed(champs);
    }
}
/** Modèle attendu : un état unique, des clauses, une opération à la fois. */
export class PlatformEngine {
    clauses;
    etat = {
        tenants: new Map([['default', newTenant('default')]]),
        seq: 0,
        journal_seq: 0,
        donnees: new Map(),
    };
    tables = new Map();
    constructor(clauses) {
        this.clauses = clauses;
    }
    table(n) {
        let t = this.tables.get(n);
        if (t === undefined) {
            t = decisionTable(this.clauses, n);
            this.tables.set(n, t);
        }
        return t;
    }
    apply(step) {
        const n = periodNumber(step.period);
        if (n === null)
            throw new Error(`PERIODE-ILLISIBLE ${String(step.period)}`);
        const ctx = new PlatformContext(this.etat, step, n, this.table(n));
        let reponse;
        for (const e of ctx.regles('requete.')) {
            reponse = e.etape(ctx);
            if (reponse !== undefined)
                break;
        }
        if (reponse === undefined)
            reponse = derouler(ctx);
        for (const f of ctx.sorties)
            reponse = f(reponse);
        return reponse;
    }
}
/** Déroule l'opération courante du contexte : enveloppe, étapes, effet, compléments, mémorisation, invariants. */
export function derouler(ctx) {
    const op = ctx.step.op;
    const effet = ctx.regleOpt(`${op}.effet`);
    if (effet === undefined)
        throw new Error(`OPERATION-SANS-CLAUSE ${op} a P${String(ctx.periode)}`);
    const etapes = [...ctx.regles('enveloppe.'), ...ctx.regles(`${op}.etape.`)];
    let reponse;
    for (const e of etapes) {
        reponse = e.etape(ctx);
        if (reponse !== undefined)
            break;
    }
    if (reponse === undefined)
        reponse = effet(ctx);
    for (const c of ctx.regles(`${op}.complement.`))
        reponse = c(ctx, reponse);
    for (const f of ctx.apres)
        f(reponse);
    for (const v of ctx.regles('invariant.'))
        v(ctx, reponse);
    return reponse;
}
