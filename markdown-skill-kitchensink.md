# Markdown Formatter Skill Kitchensink

This scratch file is intentionally mixed: clean tables, formatter-dirty tables, GFM empty-cell tables, adjacent-pipe
tables, prose around tables, subsections, and fenced examples that must remain untouched.

## Clean Leading-Pipe Table

The formatter should normalize spacing without changing the structure of this table.

| Feature | Status | Notes |
|---|---|---|
| headings | stable | section titles stay plain Markdown |
| tables | guarded | table shape is checked before and after formatting |
| prose | wrapped | long prose is bounded by the configured print width |

## No-Leading-Pipe Table

This table uses valid GFM table syntax without outer pipes.

Name | Age | City
--- | --- | ---
Alice | 30 | NYC
Bob | 25 | London

### No-Leading-Pipe Empty Edge Cells

These rows are valid GFM, but `oxfmt` can erase the empty edge cells if the skill does not skip formatting.

Left | Right
--- | ---
 | starts with an empty left cell
ends with an empty right cell |

## Adjacent-Pipe Empty Cells

This table starts with `||` on each row to reproduce the historical Hermes/oxfmt failure mode.

| | Name | Role | |
| | --- | --- | |
| | Ada | formatter | |
| | Grace | guard | |

## Mixed Alignment And Empty Cells

This table combines alignment markers, an internal empty cell, and a trailing empty cell.

| Item | Owner | State | |
| :--- | :---: | ---: | |
| alpha | docs | ready | |
| beta | | pending | |

## Text Around Tables

The paragraphs before and after this table should stay normal Markdown. The table is deliberately compact so `--fix`
has visible formatting work to do.

| Command | Expected behavior |
|---|---|
| `--validate` | structural checks only |
| `--check` | formatting check without writes |
| `--fix` | repair unsafe tables and format when safe |
| `--fix --guard` | rollback-safe formatting |

After the table, this paragraph confirms the formatter keeps surrounding prose as prose rather than merging it into the
table block.

## Fenced Markdown Example

The table-shaped text in this fence should remain untouched by table validators and repairs.

```markdown
|| not | a | real | table ||
|| --- | --- | --- | --- ||
|| leave | this | fence | alone ||
```

## MDX-Like Fence And Prose

```jsx
export function Demo() {
  return <TableLike text="A || B" />;
}
```

Final paragraph. This file is a local scratch artifact for exercising the installed skill behavior against realistic
Markdown content.
