# Delimiter-row-only adjacent pipes

Adjacent pipes (`||`) only in the delimiter row, not in header or data rows.
This triggers both adjacent-pipe detection (check-pipes) and column-count
mismatch (check-tables, check-structure) simultaneously.

ColCounts: header=2, delimiter=4 (leading empty + 2 delimiters + trailing empty), row1=2

| Name | Age |
|| ----- | --- |
| Alice | 30  |
| Bob   | 25  |

## Normal delimiter for comparison

| Name | Age |
| ---- | --- |
| Alice | 30  |
