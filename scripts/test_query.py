#!/usr/bin/env python3
"""Exercise the SQL explanation grammar against the browser's shared corpus."""
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'format'))
from check_query import Parser, tokens, compile_scope, QueryError  # noqa: E402
from check_map import check  # noqa: E402

TABLES = {'orders':['id','customer_id','currency','refund_cutoff','internal_note','status'],
          'customers':['id','region_id','name'], 'payments':['id','order_id','amount'],
          'regions':['id','name'], 'refunds':['id','payment_id','currency','created_at','amount'],
          'sales':['customer_id','quarter','revenue']}


class QueryTests(unittest.TestCase):
    def test_shared_corpus(self):
        cases = json.loads((ROOT / 'map-viewer/test/fixtures/query-cases.json').read_text())
        for case in cases:
            with self.subTest(case=case['name']):
                try:
                    compile_scope(Parser(tokens(case['sql'])).parse(), TABLES)
                    ok = True
                except QueryError:
                    ok = False
                self.assertEqual(ok, case['ok'])

    def test_complete_example_and_walkthrough(self):
        self.assertEqual(check(ROOT / 'examples/maps/query-understanding.md'), [])

    def test_duplicate_query_anchors(self):
        import tempfile
        text = '# Names\n\n```mermaid\nerDiagram\n A {\n int id PK\n }\n```\n'
        for name in ('Two words','Two-words'):
            text += '\n## Query: '+name+'\n\n```sql\nSELECT id FROM A\n```\n'
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'map.md'
            p.write_text(text)
            self.assertEqual({x[1] for x in check(p)}, {'query-syntax'})

    def test_schema_mapping(self):
        import tempfile
        text = '# Names\n\n```mermaid\nerDiagram\n ORDER {\n int id PK\n }\n```\n\n## Query: Names\n\n```sql\nSELECT o.id FROM sales.orders o\n```\n\n#### Physical names\n- sales.orders: ORDER\n'
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'map.md'
            p.write_text(text)
            self.assertEqual(check(p), [])


if __name__ == '__main__':
    unittest.main()
