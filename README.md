# ios_rule

Builds equivalent rule sets for Clash, Surge, and sing-box from the sources in
`sources.json` and the local additions in `extras.json`. An extra can specify
`"os": "macos"`, `"os": "linux"`, or `"os": "windows"`. Surge receives macOS
extras, while the Mihomo (Clash) and sing-box outputs receive extras for all
three platforms. Extras without an `os` field go to every output.

Use `process-name` for executable names and `process-path-wildcard` for paths
with `*` or `?`. Surge path patterns must start with `/`.
Surge and Mihomo apply `no-resolve` to external IP-CIDR rules. Use
`ipcidr-no-resolve` to apply the same flag to a local extra. Sing-box exports
these ranges as ordinary `ip_cidr` entries.

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
