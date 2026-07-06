# ios_rule

Builds equivalent rule sets for Clash, Surge, and sing-box from the sources in
`sources.json` and the local additions in `extras.json`.

Run the generator with:

```shell
python main.py
```

Generated files are written to:

- `output/clash/<set>.list`
- `output/surge/<set>.list`
- `output/singbox/<set>.json`

The sing-box files use its JSON source rule-set format and can be compiled with
`sing-box rule-set compile <file>.json`.
