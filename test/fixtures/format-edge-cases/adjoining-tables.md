# Adjoining Tables (no blank line separator)

Per GFM §4.10, two tables separated by a blank line are independent tables.
Two tables WITHOUT a blank line are parsed as one table with a split row.
This fixture tests how the guard scripts handle the adjoining case.

## Adjoining tables (no blank line between)

| A | B |
|---|---|
| 1 | 2 |
| C | D |
|---|---|
| 3 | 4 |

The first table's data rows (`| 1 | 2 |`) flow directly into what GFM would
parse as the second table's header (`| C | D |`). The extraction logic should
treat this as one table with 2 data rows, not two tables.

## Same tables, separated by blank line (valid reference)

| A | B |
|---|---|
| 1 | 2 |

| C | D |
|---|---|
| 3 | 4 |
