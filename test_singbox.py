import json
import os
import tempfile
import unittest

import singbox
import utils


class SingBoxTest(unittest.TestCase):
    def test_build_rule_set_maps_supported_rules(self):
        rules = utils.empty_rules_dict()
        rules.update(
            {
                "domain": ["exact.example"],
                "domain-suffix": ["example.com"],
                "domain-keyword": ["example"],
                "ipcidr": ["192.0.2.0/24"],
                "dest-port": ["80", "443"],
            }
        )

        self.assertEqual(
            singbox.build_rule_set(rules),
            {
                "version": 1,
                "rules": [
                    {
                        "domain": ["exact.example"],
                        "domain_suffix": ["example.com"],
                        "domain_keyword": ["example"],
                        "ip_cidr": ["192.0.2.0/24"],
                    },
                    {"port": [80, 443]},
                ],
            },
        )

    def test_to_file_writes_json_source_rule_set(self):
        rules = utils.empty_rules_dict()
        rules["domain-suffix"] = ["example.com"]

        original_directory = os.getcwd()
        with tempfile.TemporaryDirectory() as directory:
            try:
                os.chdir(directory)
                singbox.to_file({"Test": rules})
                with open(
                    os.path.join("output", "singbox", "Test.json"),
                    encoding="utf-8",
                ) as file:
                    generated = json.load(file)
            finally:
                os.chdir(original_directory)

        self.assertEqual(
            generated,
            {
                "version": 1,
                "rules": [{"domain_suffix": ["example.com"]}],
            },
        )

    def test_invalid_port_is_rejected(self):
        rules = utils.empty_rules_dict()
        rules["dest-port"] = ["70000"]

        with self.assertRaisesRegex(ValueError, "Invalid destination port"):
            singbox.build_rule_set(rules)


if __name__ == "__main__":
    unittest.main()
