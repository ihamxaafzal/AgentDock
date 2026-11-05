"""Read only this run's exact delegation call results from canonical history."""
import json
import sqlite3
import sys
from pathlib import Path
database, session, calls = sys.argv[1:]
calls = json.loads(calls)
if not calls:
    print('[]')
    raise SystemExit
connection = sqlite3.connect(Path(database).resolve().as_uri()+'?mode=ro',uri=True)
query = 'SELECT tool_call_id,content FROM messages WHERE session_id=? AND role=? AND tool_call_id IN ('+','.join('?' for _ in calls)+') ORDER BY id'
rows = connection.execute(query,[session,'tool',*calls]).fetchall()
print(json.dumps([{'tool_call_id':call,'output':content} for call,content in rows]))
