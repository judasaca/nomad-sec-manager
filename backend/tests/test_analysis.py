from datetime import UTC, datetime
from unittest import TestCase

from bson import ObjectId
from nomad_sec_ops import AnalysisReport
from nomad_sec_ops.models import (
    AnalysisStatus,
    CheckResult,
    DependencyAudit,
    Finding,
    StepResult,
    UpstreamRule,
)

from nomad_sec_manager.analysis import AnalysisResult, report_fields
from nomad_sec_manager.analysis_results import AnalysisSummary, PythonCounts


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
                    name="ci-cd",
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
                    name="python-dependencies",
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
        self.assertTrue(fields["ci_cd_evaluated"])
        self.assertIsNone(fields["python_counts"])

    def test_python_audit_counts_and_details_survive_serialization(self):
        audit = DependencyAudit.model_validate(
            {
                "audited_packages": 2,
                "vulnerabilities": [
                    {
                        "dependency": {"name": "example", "version": "1.0"},
                        "id": "PYSEC-0000-1",
                        "summary": "An example advisory",
                        "link": "https://example.org/advisory",
                        "fix_versions": ["1.1"],
                    }
                ],
                "adverse_statuses": [
                    {"name": "archived-example", "status": "archived", "reason": None}
                ],
            }
        )
        for vulnerabilities, adverse_statuses, expected in (
            (audit.vulnerabilities, audit.adverse_statuses, "findings"),
            ([], audit.adverse_statuses, "findings"),
            ([], [], "clean"),
        ):
            with self.subTest(
                vulnerabilities=vulnerabilities, adverse=adverse_statuses
            ):
                current_audit = audit.model_copy(
                    update={
                        "vulnerabilities": vulnerabilities,
                        "adverse_statuses": adverse_statuses,
                    }
                )
                fields = report_fields(
                    AnalysisReport(
                        steps=[
                            StepResult(
                                name="python-dependencies",
                                result=CheckResult(
                                    status=AnalysisStatus.FINDINGS
                                    if vulnerabilities
                                    else AnalysisStatus.PASSED,
                                    message="Python audit completed.",
                                    dependency_audit=current_audit,
                                ),
                            )
                        ]
                    )
                )
                result = AnalysisResult.from_document(
                    {
                        "_id": ObjectId(),
                        "repository_id": ObjectId(),
                        "repository_name": "example/repository",
                        "global_run_id": ObjectId(),
                        "created_at": datetime.now(UTC),
                        **fields,
                    }
                )
                self.assertEqual(result.status, expected)
                self.assertFalse(result.ci_cd_evaluated)
                self.assertEqual(sum(result.counts.model_dump().values()), 0)
                self.assertEqual(
                    result.python_counts,
                    PythonCounts(
                        security_findings=len(vulnerabilities),
                        adverse_project_statuses=len(adverse_statuses),
                    ),
                )
                self.assertEqual(result.steps[0].dependency_audit, current_audit)

    def test_legacy_result_keeps_ci_cd_counts_with_python_unavailable(self):
        result = AnalysisSummary.from_document(
            {
                "_id": ObjectId(),
                "repository_id": ObjectId(),
                "repository_name": "example/repository",
                "global_run_id": ObjectId(),
                "created_at": datetime.now(UTC),
                "status": "findings",
                "counts": {"high": 2},
            }
        )
        self.assertEqual(result.counts.high, 2)
        self.assertIsNone(result.ci_cd_evaluated)
        self.assertIsNone(result.python_counts)
