from copy import deepcopy
import json

import requests
import utils
import v2ray
import surge
import clash
import singbox

DESKTOP_PLATFORMS = {"macos", "linux", "windows"}


def add_rules(rules_collection: dict, set_name: str, rules: dict[str, list[str]]):
    set_rules = rules_collection.setdefault(set_name, utils.empty_rules_dict())
    for rule_type, values in set_rules.items():
        values.extend(rules.get(rule_type, []))
    return rules_collection


def rules_with_extras(rules_collection: dict, extras: list[dict], platforms: set[str]):
    output_rules = deepcopy(rules_collection)
    for extra in extras:
        platform = extra.get("os")
        if platform is not None and platform not in DESKTOP_PLATFORMS:
            raise ValueError(f"Unknown OS in extras.json: {platform}")
        if platform is None or platform in platforms:
            add_rules(output_rules, extra["set"], extra["rules"])
    return utils.remove_duplicates(output_rules)


def main():
    with open('sources.json', 'r') as f:
        sources = json.load(f)
    rules_collection = {}
    for source in sources:
        response = requests.get(source['url'])
        if response.status_code == 200:
            data = response.text
        else:
            print(f"Failed to fetch data from {source['url']} with status code {response.status_code}")
            continue
        if source['type'] == 'v2ray':
            rules = v2ray.get_rules(data)
        elif source['type'] == 'surge':
            rules = surge.get_rules(data)

        rules["ipcidr-no-resolve"].extend(rules.pop("ipcidr"))
        rules_collection = add_rules(rules_collection, source['set'], rules)
    
    with open('extras.json', 'r') as f:
        extras = json.load(f)

    surge_rules = rules_with_extras(rules_collection, extras, {"macos"})
    desktop_rules = rules_with_extras(rules_collection, extras, DESKTOP_PLATFORMS)
    surge.to_file(surge_rules)
    clash.to_file(desktop_rules)
    singbox.to_file(desktop_rules)
if __name__ == "__main__":
    main()
