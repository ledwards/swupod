'use client'

import type { PackQualityData } from '@/src/services/packQualityService'
import { structuralStatus, worstStatus } from '@/src/services/qaReport'
import { MetaSection } from '@/src/components/Meta/MetaBits'
import { QAStatusBadge } from './QAStatusBadge'

/** Structural checks as a chip grid; a table appears only when a check fails. */
export function QAStructure({ data }: { data: PackQualityData }) {
  const checks = data.structuralMetrics || []
  const failing = checks.filter((m) => m.status === 'fail')
  const verdict = worstStatus(checks.map((m) => structuralStatus(m.status)))
  return (
    <MetaSection panel title="Structural Checks" subtitle="Every tracked pack against the pack's slot rules." actions={<QAStatusBadge status={verdict} />}>
      <ul className="qar-chips">
        {checks.map((m) => (
          <li key={m.metric} className="qar-chip">
            <span className="qar-chip-name">{m.metric}</span>
            <span className="qar-chip-foot">
              <QAStatusBadge status={structuralStatus(m.status)} />
              <span className="mstats-muted">{m.passed.toLocaleString()} passed{m.failed > 0 ? `, ${m.failed.toLocaleString()} failed` : ''}</span>
            </span>
          </li>
        ))}
      </ul>
      {failing.length > 0 && (
        <div className="qar-table-wrap">
          <table className="qar-table">
            <thead><tr><th>Check</th><th className="qar-num">Passed</th><th className="qar-num">Failed</th><th className="qar-num">Pass rate</th><th>Status</th></tr></thead>
            <tbody>
              {failing.map((m) => (
                <tr key={m.metric}>
                  <td>{m.metric}</td>
                  <td className="qar-num">{m.passed.toLocaleString()}</td>
                  <td className="qar-num">{m.failed.toLocaleString()}</td>
                  <td className="qar-num">{(m.rate * 100).toFixed(2)}%</td>
                  <td><QAStatusBadge status="fail" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </MetaSection>
  )
}
