from unittest import TestCase

from nomad_sec_ops import AnalysisReport
from nomad_sec_ops.models import (
    AnalysisStatus,
    CheckResult,
    Finding,
    StepResult,
    UpstreamRule,
)

from nomad_sec_manager.analysis import report_fields


class ReportFieldsTests(TestCase):
    def test_only_evaluated_reports_with_no_findings_are_clean(self):
        for step_status, expected in (
            (AnalysisStatus.PASSED, "clean"),
            (AnalysisStatus.SKIPPED, "not_evaluated"),
            (AnalysisStatus.NOT_EVALUATED, "not_evaluated"),
            (AnalysisStatus.ERROR, "failed"),
        ):
            with self.subTest(status=step_status):
                report = AnalysisReport(
                    steps=[
                        StepResult(
                            name="ci-cd",
                            result=CheckResult(status=step_status, message="Test"),
                        )
                    ]
                )
                self.assertEqual(report_fields(report)["status"], expected)
        self.assertEqual(report_fields(AnalysisReport())["status"], "not_evaluated")

    def test_counts_and_evidence_survive_an_incomplete_report(self):
        finding = Finding(
            rule_id="example",
            severity="high",
            confidence="high",
            persona="regular",
            file="workflow.yml",
            line=1,
            column=1,
            location="workflow.yml:1:1",
            message="A finding",
            evidence="Example evidence",
            remediation="Example fix",
            upstream=UpstreamRule(
                tool="example",
                rule_id="example",
                version=None,
                commit=None,
                source_url=None,
                documentation_url="https://example.org/check",
            ),
        )
        report = AnalysisReport(
            steps=[
                StepResult(
                    name="first",
                    result=CheckResult(
                        status=AnalysisStatus.FINDINGS,
                        message="Findings",
                        findings=[
                            finding,
                            finding.model_copy(update={"severity": "low"}),
                        ],
                    ),
                ),
                StepResult(
                    name="second",
                    result=CheckResult(
                        status=AnalysisStatus.NOT_EVALUATED, message="Skipped"
                    ),
                ),
            ]
        )
        fields = report_fields(report)
        self.assertEqual(fields["status"], "not_evaluated")
        self.assertEqual(
            fields["counts"], {"high": 1, "medium": 0, "low": 1, "informational": 0}
        )
        self.assertEqual(
            fields["steps"][0]["findings"][0]["evidence"], "Example evidence"
        )
