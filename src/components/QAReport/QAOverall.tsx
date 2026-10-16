'use client'

import { useState } from 'react'
import Button from '@/src/components/Button'
import ContentSkeleton from '@/src/components/ContentSkeleton'
import { MetaEmpty, MetaSection } from '@/src/components/Meta/MetaBits'
import { GENERAL_GROUP, type QATestGroup, type QATestResult } from '@/src/services/qaReport'
import { QAKpi } from './QABits'
import { QAStatusBadge } from './QAStatusBadge'
import type { QAResults } from '@/src/hooks/useQAResults'

function TestRow({ test }: { test: QATestResult }) {
  return (
    <li className="qar-test">
      <span className="qar-test-head">
        <QAStatusBadge status={test.status === 'passed' ? 'pass' : 'fail'} />
        <span className="qar-test-name">{test.name}</span>
        <span className="mstats-muted">{test.suite}{test.executionTime != null ? ` · ${test.executionTime}ms` : ''}</span>
      </span>
      {test.errorMessage && <pre className="qar-test-error">{test.errorMessage}</pre>}
    </li>
  )
}

/** Latest `npm run qa` run: one tile per set, the failing tests, then everything collapsed. */
export function QAOverall({ results, groups, loading }: { results: QAResults | null; groups: QATestGroup[]; loading: boolean }) {
  const [showAll, setShowAll] = useState(false)

  if (loading && !results) {
    return <div className="mstats-stack"><ContentSkeleton kind="control" count={4} /><ContentSkeleton kind="card" count={8} /></div>
  }
  const run = results?.available ? results.latestRun : null
  if (!run) {
    return <MetaEmpty>QA tests have not been run yet. Test results appear here once available.</MetaEmpty>
  }

  const failing = run.tests.filter((t) => t.status === 'failed')
  const withData = groups.filter((g) => g.status !== 'none' && g.key !== GENERAL_GROUP)
  const setsPassing = withData.filter((g) => g.status === 'pass').length

  return (
    <div className="mstats-stack">
      <div className="qar-kpis">
        <QAKpi value={run.summary.total.toLocaleString()} label="Tests" note={`Run ${new Date(run.runAt).toLocaleString()}`} status={run.summary.failed > 0 ? 'fail' : 'pass'} />
        <QAKpi value={run.summary.passed.toLocaleString()} of={run.summary.total} label="Passing" />
        <QAKpi value={run.summary.failed.toLocaleString()} label="Failing" />
        <QAKpi value={setsPassing} of={withData.length} label="Sets Passing" note="sets with tests in this run" />
      </div>

      <MetaSection title="By Set" subtitle="Each set's tests from the latest run, grouped by the set named in the test.">
        <ul className="qar-set-tiles">
          {groups.map((g) => (
            <li key={g.key} className="qar-set-tile">
              <span className="qar-set-code">{g.key}</span>
              <QAStatusBadge status={g.status} />
              <span className="mstats-muted">{g.tests.length === 0 ? 'No tests in this run' : `${g.passed} of ${g.tests.length} passing`}</span>
            </li>
          ))}
        </ul>
      </MetaSection>

      <MetaSection panel title={failing.length ? `Failing Tests (${failing.length})` : 'Failing Tests'}>
        {failing.length === 0
          ? <p className="qar-allpass"><QAStatusBadge status="pass" /> All {run.summary.total.toLocaleString()} tests passed in the latest run.</p>
          : <ul className="qar-tests">{failing.map((t, i) => <TestRow key={`${t.name}-${i}`} test={t} />)}</ul>}
      </MetaSection>

      <MetaSection
        title="All Tests"
        actions={(
          <Button variant="secondary" size="sm" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll} aria-controls="qar-all-tests">
            {showAll ? 'Hide all tests' : `Show all tests (${run.tests.length.toLocaleString()})`}
          </Button>
        )}
      >
        {showAll && <ul id="qar-all-tests" className="mstats-panel qar-tests">{run.tests.map((t, i) => <TestRow key={`${t.name}-${i}`} test={t} />)}</ul>}
      </MetaSection>
    </div>
  )
}
