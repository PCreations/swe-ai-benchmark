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
// seul bundlé dans le bac à sable Temporal).
export {
  acquireLease,
  closeLeaseAuthority,
  heartbeatLease,
  openLeaseAuthority,
  revokeLease,
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
