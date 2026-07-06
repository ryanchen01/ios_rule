import json
import os

import utils


def _ports(values: list[str]) -> list[int]:
    ports = []
    for value in values:
        port = int(value)
        if not 1 <= port <= 65535:
            raise ValueError(f"Invalid destination port: {value}")
        ports.append(port)
    return ports


def build_rule_set(rules: dict[str, list[str]]) -> dict:
    address_rule = {}
    field_mapping = {
        "domain": "domain",
        "domain-suffix": "domain_suffix",
        "domain-keyword": "domain_keyword",
        "ipcidr": "ip_cidr",
    }
    for source_field, singbox_field in field_mapping.items():
        if rules[source_field]:
            address_rule[singbox_field] = rules[source_field]

    headless_rules = []
    if address_rule:
        headless_rules.append(address_rule)

    ports = _ports(rules["dest-port"])
    if ports:
        # Ports must be a separate rule. Combining them with domains/IPs would
        # make sing-box apply AND semantics between the two field groups.
        headless_rules.append({"port": ports})

    return {"version": 1, "rules": headless_rules}


def to_file(rules_collection: dict):
    output_dir = "output/singbox/"
    utils.ensure_dir(output_dir)
    for set_name, rules in rules_collection.items():
        ruleset_path = os.path.join(output_dir, f"{set_name}.json")
        with open(ruleset_path, "w", encoding="utf-8") as file:
            json.dump(build_rule_set(rules), file, indent=2, ensure_ascii=False)
            file.write("\n")
