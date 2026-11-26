from datetime import UTC, datetime
from unittest import TestCase

from bson import ObjectId
from nomad_sec_ops import AnalysisReport
from nomad_sec_ops.models import (
    AnalysisStatus,
    CheckResult,
    CICDFinding,
    CICDFindingMetadata,
    DependencyAudit,
    DependencyProjectStatus,
    DependencyProjectStatusFinding,
    DependencyVulnerabilityFinding,
    StepResult,
    UpstreamRule,
)

from nomad_sec_manager.analysis import AnalysisResult, report_fields
from nomad_sec_manager.analysis_results import PythonCounts, SeverityCounts


def stored_result(fields: dict) -> AnalysisResult:
    return AnalysisResult.from_document(
        {
            "_id": ObjectId(),
            "repository_id": ObjectId(),
            "repository_name": "example/repository",
            "global_run_id": ObjectId(),
            "created_at": datetime.now(UTC),
            **fields,
        }
    )


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
                fields = report_fields(report)
                self.assertEqual(fields["status"], expected)
                if expected == "clean":
                    self.assertEqual(fields["counts"], SeverityCounts().model_dump())
                    self.assertEqual(fields["ci_cd_count"], 0)
                else:
                    self.assertIsNone(fields["counts"])
                    self.assertIsNone(fields["ci_cd_count"])
        self.assertEqual(report_fields(AnalysisReport())["status"], "not_evaluated")

    def test_counts_and_evidence_survive_an_incomplete_report(self):
        finding = CICDFinding(
            kind="ci-cd",
            severity="high",
            message="A finding",
            metadata=CICDFindingMetadata(
                rule_id="example",
                confidence="high",
                persona="regular",
                file="workflow.yml",
                line=1,
                column=1,
                location="workflow.yml:1:1",
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
        result = stored_result(fields)
        self.assertEqual(result.counts, SeverityCounts(high=1, low=1))
        self.assertEqual(result.steps[0].findings[0], finding)
        self.assertEqual(result.ci_cd_count, 2)
        self.assertIsNone(result.python_counts)

    def test_python_findings_and_metadata_survive_serialization(self):
        vulnerability = DependencyVulnerabilityFinding.model_validate(
            {
                "kind": "dependency-vulnerability",
                "message": "An example advisory",
                "severity": None,
                "advisory_id": "PYSEC-0000-1",
                "metadata": {
                    "dependency": {"name": "example", "version": "1.0"},
                    "link": "https://example.org/advisory",
                    "fix_versions": ["1.1"],
                },
            }
        )
        deprecation = DependencyProjectStatusFinding(
            kind="dependency-project-status",
            message="old-example is deprecated",
            severity=None,
            metadata=DependencyProjectStatus(
                name="old-example", status="deprecated", reason="Use new-example."
            ),
        )
        audit = DependencyAudit(
            audited_packages=3,
            adverse_statuses=[
                DependencyProjectStatus(name="archived-example", status="archived")
            ],
        )
        for findings, counts, python_counts in (
            (
                [vulnerability, deprecation],
                SeverityCounts(unavailable=2),
                PythonCounts(vulnerabilities=1, project_status_findings=1),
            ),
            (
                [deprecation],
                SeverityCounts(unavailable=1),
                PythonCounts(project_status_findings=1),
            ),
            ([], SeverityCounts(), PythonCounts()),
        ):
            with self.subTest(findings=findings):
                status = AnalysisStatus.FINDINGS if findings else AnalysisStatus.PASSED
                result = stored_result(
                    report_fields(
                        AnalysisReport(
                            steps=[
                                StepResult(
                                    name="python-dependencies",
                                    result=CheckResult(
                                        status=status,
                                        message="Python audit completed.",
                                        findings=findings,
                                        dependency_audit=audit,
                                    ),
                                )
                            ]
                        )
                    )
                )
                self.assertEqual(result.status, "findings" if findings else "clean")
                self.assertIsNone(result.ci_cd_count)
                self.assertEqual(result.counts, counts)
                self.assertEqual(result.python_counts, python_counts)
                self.assertEqual(result.steps[0].findings, findings)
                self.assertEqual(result.steps[0].dependency_audit, audit)
