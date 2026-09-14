// ─────────────────────────────────────────────────────────────────────────────
// `probeTcp` / `exposeProbeListener` (§III.2) — sondes réseau DEPUIS le netns
// du candidat, mais hors de son mount namespace/chroot : elles n'ont besoin
// que de rejoindre le netns scellé (net.ts), pas la vue de système de
// fichiers restreinte. `node` de l'hôte suffit, pas d'outil supplémentaire.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from 'node:child_process'
import { netnsPath } from './net.js'
import type { NetPlan } from './ids.js'

const CONNECT_PROBE = `
const net = require('node:net');
const host = process.argv[1];
const port = Number(process.argv[2]);
const timeoutMs = Number(process.argv[3]);
const s = net.connect({ host, port });
const done = (ok) => { try { s.destroy(); } catch {} process.exit(ok ? 0 : 1); };
s.setTimeout(timeoutMs);
s.on('connect', () => done(true));
s.on('timeout', () => done(false));
s.on('error', () => done(false));
`

export interface ProbeResult {
  readonly reachable: boolean
}

export function probeTcp(plan: NetPlan, host: string, port: number, timeoutMs: number): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const child = spawn(
      'nsenter',
      [`--net=${netnsPath(plan)}`, '--', 'node', '-e', CONNECT_PROBE, '--', host, String(port), String(timeoutMs)],
      { stdio: 'ignore' },
    )
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* déjà mort */
      }
    }, timeoutMs + 5_000)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ reachable: code === 0 })
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ reachable: false })
    })
  })
}

const LISTEN_PROBE = `
const net = require('node:net');
const s = net.createServer((c) => c.destroy());
s.on('error', () => process.exit(1));
s.listen(0, '0.0.0.0', () => { process.stdout.write('PORT=' + s.address().port + '\\n'); });
process.on('SIGTERM', () => process.exit(0));
`

export interface Listener {
  readonly host: string
  readonly port: number
  readonly kill: () => void
}

export function exposeProbeListener(plan: NetPlan): Promise<Listener> {
  return new Promise((resolve, reject) => {
    const child = spawn('nsenter', [`--net=${netnsPath(plan)}`, '--', 'node', '-e', LISTEN_PROBE], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        try {
          child.kill('SIGKILL')
        } catch {
          /* déjà mort */
        }
        reject(new Error('sandbox.exposeProbeListener: pas de port annoncé à temps'))
      }
    }, 5_000)
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString('utf8')
      const m = /PORT=(\d+)/.exec(out)
      if (m?.[1] !== undefined && !settled) {
        settled = true
        clearTimeout(timer)
        resolve({
          host: plan.ctrIp,
          port: Number(m[1]),
          kill: () => {
            try {
              child.kill('SIGKILL')
            } catch {
              /* déjà mort */
            }
          },
        })
      }
    })
    child.on('error', (e) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(e)
      }
    })
    child.on('close', () => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(new Error('sandbox.exposeProbeListener: le processus est sorti avant d\'annoncer un port'))
      }
    })
  })
}
