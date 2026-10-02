export { trajectoryWorkflow } from './trajectory-workflow.js'
export type {
  ContinuationLink,
  DuplicatedActivityReport,
  PeriodStart,
  TrajectoryWorkflowInput,
  TrajectoryWorkflowResult,
} from './trajectory-workflow.js'

// L'autorité de bail (cahier L371-L378, tâche T25) : fichier séparé de
// trajectory-workflow.ts, voir son en-tête pour la raison (ce dernier reste le
// seul bundlé dans le bac à sable Temporal). `isLeaseAdmitted`/
// `assertLeaseAdmitted`/`recordPublishedCheckpoint`/`readPublishedCheckpoints`
// ne sont PAS des rôles de la suite : ce sont les additifs partagés par
// lesquels `packages/gateway`, `packages/activities` et `packages/sandbox`
// appliquent LE MÊME contrôle de bail (L377), sans dupliquer l'état.
export {
  acquireLease,
  assertLeaseAdmitted,
  closeLeaseAuthority,
  heartbeatLease,
  isLeaseAdmitted,
  isStaleExecutionError,
  openLeaseAuthority,
  readPublishedCheckpoints,
  recordPublishedCheckpoint,
  revokeLease,
  StaleExecutionError,
  STALE_EXECUTION_CODE,
} from './lease-authority.js'
export type {
  AcquireLeaseParams,
  AcquireLeaseResult,
  HeartbeatLeaseParams,
  HeartbeatLeaseResult,
  LeaseHandle,
  OpenLeaseAuthorityOptions,
  RevokeLeaseParams,
  RevokeLeaseResult,
} from './lease-authority.js'

// La file d'admission (cahier L379-L386, tâche T26) : fichier séparé de
// trajectory-workflow.ts et de lease-authority.ts, même raison que ci-dessus
// (ce premier reste le seul bundlé dans le bac à sable Temporal).
export {
  announceAssignmentOrder,
  closeAdmissionQueue,
  getCallTimings,
  getQueueSnapshot,
  isProviderBackedOff,
  openAdmissionQueue,
  pumpAdmission,
  releaseCall,
  setProviderBackoffUntil,
  submitReadyCall,
} from './admission-queue.js'
export type {
  CallTimings,
  OpenAdmissionQueueOptions,
  PumpAdmissionParams,
  PumpAdmissionResult,
  QueueHandle,
  QueueSnapshot,
  ReleaseCallParams,
  ReleaseCallResult,
  SubmitReadyCallParams,
  SubmitReadyCallResult,
} from './admission-queue.js'

// Le balayage des points de panne (cahier L477-L486, tâche T37) : fichier
// séparé, même raison que lease-authority.ts et admission-queue.ts ci-dessus
// (trajectory-workflow.ts reste le seul bundlé dans le bac à sable Temporal).
export { runFaultDrill } from './fault-drill.js'
export type { FaultDrillPoint, FaultDrillResult, RunFaultDrillOptions } from './fault-drill.js'
