# Examples

This repository now ships the startup picker vertical slice plus a few smoke-test commands.

## Extension

`extensions/hello.ts` registers:

- `/startup-picker:hello`
- a small session status indicator

Try it with:

```bash
pi -e .
```

Then run:

```txt
/startup-picker:hello YourName
```

## Agent Skill

`skills/example-skill/SKILL.md` is still the template smoke skill.

Replace it with a real workflow or remove it once the package ships user-facing skills.

## Prompt template

`prompts/example.md` is a placeholder prompt from the template.

## Theme

`themes/example-theme.json` is a placeholder theme from the template.

## Typed custom tool

`extensions/index.ts` registers:

- `/startup-picker:about`
- `startup_picker_greet` custom tool

The tool demonstrates:

- TypeBox object parameters
- a string enum schema via `StringEnum`
- shared logic imported from `lib/greeting.ts`
