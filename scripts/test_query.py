#!/usr/bin/env python3
"""The checker's half of the query contract: the same fixtures map-viewer/test/query.js runs."""
import json
from pathlib import Path
import re
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'format'))
from check_map import check  # noqa: E402
from check_query import QueryError, QueryUnsupported, compile_query, read_query  # noqa: E402

FIXTURES = ROOT / 'map-viewer/test/fixtures'
LIMITS = json.loads((FIXTURES / 'query-cases.json').read_text(encoding='utf-8'))
MARKDOWN = json.loads((FIXTURES / 'query-markdown-cases.json').read_text(encoding='utf-8'))
TABLES = {name: [c.split(' ')[0] for c in cols] for name, cols in LIMITS['tables'].items()}


def run(sql, dialect=None):
    settings = {'dialect': dialect}
    return compile_query(read_query(sql, settings), TABLES, settings)


class QueryCases(unittest.TestCase):
    def test_shared_sql_cases(self):
        for case in LIMITS['cases']:
            with self.subTest(case=case['name']):
                try:
                    got, outputs = 'ok', run(case['sql'], case.get('dialect'))
                except QueryUnsupported:
                    got, outputs = 'unsupported', None
                except QueryError:
                    got, outputs = 'syntax', None
                self.assertEqual(got, case['expect'])
                if got == 'ok':
                    self.assertEqual(outputs, case['outputs'])

    def test_shared_markdown_cases(self):
        for case in MARKDOWN['cases']:
            with self.subTest(case=case['name']), tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / 'map.md'
                path.write_bytes(case['text'].encode('utf-8'))
                codes = {p[1] for p in check(path)} - {'diagram-unreachable'}
                self.assertEqual(sorted(codes), sorted(case['codes']))

    def test_examples_pass(self):
        for name in ('query-expansion', 'query-pivot', 'query-unpivot', 'query-understanding', 'sales-warehouse', 'shop-layers'):
            with self.subTest(map=name):
                self.assertEqual([p for p in check(ROOT / 'examples/maps' / (name + '.md')) if p[2] == 'error'], [])

    def test_legacy_query_message_says_how_to_migrate(self):
        problems = check(ROOT / 'format/samples/query-legacy-format.md')
        self.assertEqual({p[1] for p in problems}, {'query-legacy-format'})
        for instruction in ('flowchart overview', 'original SQL', 'Query options', 'Schema:', 'Into:', 'Sources:', 'sql-queries.md', 'query-expansion.md'):
            self.assertIn(instruction, problems[0][3])

    def test_unsupported_sql_passes_with_a_warning(self):
        problems = check(ROOT / 'format/samples/query-unsupported.md')
        self.assertEqual([(p[1], p[2]) for p in problems], [('query-unsupported', 'warning')])

    def test_token_rules_match_the_viewer(self):
        text = (ROOT / 'map-viewer/query/sql.js').read_text(encoding='utf-8')
        import check_query
        for js_name, py_value in (('WORDS', check_query.WORDS),):
            listed = re.search(js_name + r" = new Set\(\('([^']+)'\)", text)
            self.assertEqual(set(listed[1].split()), py_value)
        for js_name, py_value in (('NOT_A_FUNCTION', check_query.NOT_A_FUNCTION), ('EXPRESSION_WORDS', check_query.EXPRESSION_WORDS), ('OTHER_STATEMENTS', check_query.OTHER_STATEMENTS), ('ALIAS_STOPS', check_query.ALIAS_STOPS)):
            listed = re.search(r'const ' + js_name + r" = (?:new Set\()?\[([^\]]+)\]", text)
            self.assertEqual(set(re.findall(r"'([^']+)'", listed[1])), py_value, js_name)


if __name__ == '__main__':
    unittest.main()
