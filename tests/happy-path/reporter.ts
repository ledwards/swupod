import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
export default class FailureDetails implements Reporter {
    onTestEnd(test: TestCase, result: TestResult) { if (result.status !== 'passed')
        for (const error of result.errors)
            console.error(`${test.title}\n${error.message}`); }
}
