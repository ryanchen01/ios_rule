import json
import os
from pathlib import Path
import re
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import main


class ExtrasTest(unittest.TestCase):
    def test_exports_apply_os_scopes_and_no_resolve(self):
        extras = [
            {"set": "AI", "rules": {
                "domain": ["example.com"],
                "ipcidr": ["192.0.2.0/24", "198.51.100.0/24"],
                "ipcidr-no-resolve": ["192.0.2.0/24"],
            }},
            {"set": "AI", "os": "macos", "rules": {"process-name": ["Claude"]}},
            {"set": "AI", "os": "linux", "rules": {
                "process-path-wildcard": ["*/.local/share/claude/versions/*"],
            }},
            {"set": "AI", "os": "windows", "rules": {"process-name": ["claude.exe"]}},
        ]

        with tempfile.TemporaryDirectory() as directory:
            original_directory = os.getcwd()
            try:
                os.chdir(directory)
                Path("sources.json").write_text(json.dumps([
                    {"set": "AI", "type": "surge", "url": "https://example.com/rules"},
                ]))
                Path("extras.json").write_text(json.dumps(extras))
                source = SimpleNamespace(status_code=200, text="IP-CIDR,203.0.113.0/24\n")
                with patch.object(main.requests, "get", return_value=source):
                    main.main()
                surge = Path("output/surge/AI.list").read_text().splitlines()
                mihomo = Path("output/clash/AI.list").read_text().splitlines()
                singbox = json.loads(Path("output/singbox/AI.json").read_text())
            finally:
                os.chdir(original_directory)

        self.assertEqual(surge, [
            "DOMAIN,example.com",
            "IP-CIDR,192.0.2.0/24,no-resolve",
            "IP-CIDR,198.51.100.0/24",
            "IP-CIDR,203.0.113.0/24,no-resolve",
            "PROCESS-NAME,Claude",
        ])
        self.assertEqual(mihomo, [
            "payload:",
            "  - DOMAIN,example.com",
            "  - IP-CIDR,192.0.2.0/24,no-resolve",
            "  - IP-CIDR,198.51.100.0/24",
            "  - IP-CIDR,203.0.113.0/24,no-resolve",
            "  - PROCESS-NAME,Claude",
            "  - PROCESS-NAME,claude.exe",
            "  - PROCESS-PATH-WILDCARD,*/.local/share/claude/versions/*",
        ])
        address, names, paths = singbox["rules"]
        self.assertEqual(address, {
            "domain": ["example.com"],
            "ip_cidr": ["192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24"],
        })
        self.assertEqual(names, {"process_name": ["Claude", "claude.exe"]})
        pattern, = paths["process_path_regex"]
        self.assertTrue(re.search(pattern, "/home/alex/.local/share/claude/versions/2.1.1"))
        self.assertFalse(re.search(pattern, "/home/alex/xlocal/share/claude/versions/2.1.1"))
