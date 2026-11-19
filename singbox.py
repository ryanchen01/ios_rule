import json
import os
import re

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
    }
    for source_field, singbox_field in field_mapping.items():
        if rules[source_field]:
            address_rule[singbox_field] = rules[source_field]

    cidrs = [cidr for cidr, _ in utils.ipcidr_entries(rules)]
    if cidrs:
        address_rule["ip_cidr"] = cidrs

    headless_rules = []
    if address_rule:
        headless_rules.append(address_rule)

    ports = _ports(rules["dest-port"])
    if ports:
        # Ports must be a separate rule. Combining them with domains/IPs would
        # make sing-box apply AND semantics between the two field groups.
        headless_rules.append({"port": ports})

    process_names = rules.get("process-name", [])
    if process_names:
        headless_rules.append({"process_name": process_names})

    process_paths = rules.get("process-path-wildcard", [])
    if process_paths:
        # A separate rule lets either the executable name or path match.
        patterns = [
            re.escape(path).replace(r"\*", ".*").replace(r"\?", ".")
            for path in process_paths
        ]
        headless_rules.append({"process_path_regex": [f"^{pattern}$" for pattern in patterns]})

    return {"version": 1, "rules": headless_rules}


def to_file(rules_collection: dict):
    output_dir = "output/singbox/"
    utils.ensure_dir(output_dir)
    for set_name, rules in rules_collection.items():
        ruleset_path = os.path.join(output_dir, f"{set_name}.json")
        with open(ruleset_path, "w", encoding="utf-8") as file:
            json.dump(build_rule_set(rules), file, indent=2, ensure_ascii=False)
            file.write("\n")
